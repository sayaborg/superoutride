import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { DEFAULT_EXHAUST_TUNING, OUTPUT } from '../dist/audio/exhaust-acoustics.js';
import { compileVehicleAudioProfile } from '../dist/audio/vehicle-audio-profile.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
const profiles = VEHICLE_CATALOG.filter((entry) => entry.sound.exhaust);
function render(profile, load, coupled = true, rate = 48000) {
  const engine = new ExhaustWaveguide(profile, rate, coupled);
  const samples = new Float32Array(rate);
  for (let i = 0; i < samples.length; i++) samples[i] = engine.sample(3000, load);
  return samples.subarray(rate / 2);
}
const energy = (a) => a.reduce((sum, x) => sum + x * x, 0) / a.length;
const difference = (a, b) => a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0) / a.length;

test('the final low-pass limits clipped pulse transients in both exhaust methods', () => {
  // A sharp, strong single-cylinder pulse exposes clipping after filtering.
  const profile = compileVehicleAudioProfile({
    cycleRevolutions: 2,
    firingPhases: [0],
    exhaust: { banks: [0], lengths: [0.5], outlet: 1 },
    pulse: { strength: 4, riseSeconds: 0.00001, decaySeconds: 0.006 },
  });
  for (const rate of [88200, 96000])
    for (const coupled of [false, true]) {
      const synth = new ExhaustWaveguide(profile, rate, coupled, { outletReflection: 0 });
      const coefficient = 1 - Math.exp((-2 * Math.PI * DEFAULT_EXHAUST_TUNING.outputCutoffHz) / rate);
      let previous = 0,
        peak = 0;
      for (let i = 0; i < rate / 2; i++) {
        const value = synth.sample(3000, 1);
        // Undo only the final linear filter: its input must respect the clipper's bound.
        const input = (value - (1 - coefficient) * previous) / coefficient;
        assert.ok(Number.isFinite(input) && Math.abs(input) <= OUTPUT.ceiling + 1e-12);
        peak = Math.max(peak, Math.abs(value));
        previous = value;
      }
      assert.ok(peak > OUTPUT.ceiling / 2, 'the fixture must exercise substantial saturation');
    }
});

test('output cutoff changes only the final filter, preserving the clipped exhaust signal', () => {
  const sound = VEHICLE_CATALOG[2].sound;
  for (const rate of [88200, 96000])
    for (const coupled of [false, true]) {
      const cutoffs = [100, 1000, DEFAULT_EXHAUST_TUNING.outputCutoffHz, 12000];
      const voices = cutoffs.map((outputCutoffHz) => new ExhaustWaveguide(sound, rate, coupled, { outputCutoffHz }));
      const coefficients = cutoffs.map((hz) => 1 - Math.exp((-2 * Math.PI * hz) / rate));
      const previous = voices.map(() => 0);
      let difference = 0;
      for (let i = 0; i < rate / 4; i++) {
        const outputs = voices.map((voice) => voice.sample(6000, 1));
        const inputs = outputs.map((value, j) => (value - (1 - coefficients[j]) * previous[j]) / coefficients[j]);
        for (let j = 0; j < voices.length; j++) {
          assert.ok(Number.isFinite(outputs[j]) && Math.abs(outputs[j]) < OUTPUT.ceiling);
          // Different final filters must receive the same pre-filter signal, including all reflections.
          assert.ok(Math.abs(inputs[j] - inputs[2]) < 1e-10);
          previous[j] = outputs[j];
        }
        difference += (outputs[0] - outputs[3]) ** 2;
      }
      assert.ok(difference > 0.01, 'cutoff must audibly affect the generated waveform');
    }
});

test('waveguide exhaust remains bounded under load and geometry changes at both output rates', () => {
  for (const { sound } of profiles)
    for (const rate of [88200, 96000]) {
      const closed = render(sound, 0, true, rate),
        open = render(sound, 1, true, rate);
      assert.ok([...closed, ...open].every((x) => Number.isFinite(x) && Math.abs(x) < 0.65));
      assert.ok(energy(open) > energy(closed) * 1.2);
      const reference = render(sound, 1, false, rate);
      assert.ok(difference(open, reference) > 0.01 * energy(open));
      const altered = render(
        { ...sound, exhaust: { ...sound.exhaust, outlet: sound.exhaust.outlet * 1.3 } },
        1,
        true,
        rate,
      );
      assert.ok(difference(open, altered) > 0.01 * energy(open));
    }
});

test('bank grouping affects V8 exhaust and rendering is deterministic', () => {
  const sound = profiles.find((entry) => entry.profile.id === 'CORVETTE_C4').sound;
  const a = render(sound, 1),
    b = render(sound, 1);
  assert.deepEqual(a, b);
  const combined = render({ ...sound, exhaust: { ...sound.exhaust, banks: Array(8).fill(0) } }, 1);
  assert.ok(difference(a, combined) > energy(a) * 0.1);
});

test('topology authoring validates dimensions and retains immutable private copies', () => {
  const sound = profiles[0].sound;
  const exhaust = structuredClone(sound.exhaust);
  const compiled = compileVehicleAudioProfile({ ...sound, exhaust });
  exhaust.banks[0] = 9;
  assert.notEqual(compiled.exhaust.banks[0], 9);
  for (const change of [
    { banks: [] },
    { lengths: [NaN] },
    { outlet: Infinity },
    { banks: sound.exhaust.banks.map(() => 2) },
  ])
    assert.throws(() => compileVehicleAudioProfile({ ...sound, exhaust: { ...sound.exhaust, ...change } }), RangeError);
});

test('sustained redline and abrupt load/RPM changes do not destabilize feedback', () => {
  for (const { sound, profile } of profiles) {
    const synth = new ExhaustWaveguide(sound, 96000);
    for (let i = 0; i < 96000 * 3; i++) {
      const x = synth.sample(
        i < 96000 ? profile.powertrain.idleRpm : profile.powertrain.redlineRpm,
        i < 192000 ? 1 : 0,
      );
      assert.ok(Number.isFinite(x) && Math.abs(x) < 0.65);
    }
  }
});

test('worklet renders identical streams across block partitions, ignores invalid authoring and stops', async () => {
  const old = {
    base: globalThis.AudioWorkletProcessor,
    register: globalThis.registerProcessor,
    rate: globalThis.sampleRate,
  };
  let Processor;
  globalThis.AudioWorkletProcessor = class {
    port = {};
  };
  globalThis.registerProcessor = (_, value) => {
    Processor = value;
  };
  globalThis.sampleRate = 48000;
  try {
    await import('../dist/audio/exhaust-processor.js');
    const ready = new Processor({ processorOptions: { profile: profiles[0].sound, coupled: true } });
    const startup = [[new Float32Array(48000)]];
    ready.process([], startup, { rpm: new Float32Array([3000]), load: new Float32Array([1]) });
    assert.ok(startup[0][0].some((x) => Math.abs(x) > 0.001));
    for (const coupled of [false, true]) {
      const tuning = {
        outletReflection: -0.8,
        returnCutoffHz: 1800,
        attenuationPerMeter: 0.12,
        closedExcitation: 0.1,
        outputCutoffHz: 800,
      };
      const direct = new ExhaustWaveguide(profiles[0].sound, 96000, coupled, tuning);
      const configured = new Processor({ processorOptions: { profile: profiles[0].sound, coupled, tuning } });
      const messaged = new Processor();
      messaged.port.onmessage({ data: { profile: profiles[0].sound, coupled, tuning } });
      const params = { rpm: new Float32Array([3000]), load: new Float32Array([0.25]) };
      const actual = [[new Float32Array(4096)]],
        replaced = [[new Float32Array(4096)]];
      configured.process([], actual, params);
      messaged.process([], replaced, params);
      for (const value of actual[0][0])
        assert.equal(value, Math.fround((direct.sample(3000, 0.25) + direct.sample(3000, 0.25)) * 0.5));
      assert.deepEqual(actual, replaced);
      messaged.port.onmessage({ data: { profile: profiles[0].sound, coupled, tuning: { outletReflection: 2 } } });
      messaged.process([], replaced, params);
      assert.ok(replaced[0][0].every((x) => x === 0));
    }
    const a = new Processor(),
      b = new Processor();
    for (const p of [a, b]) p.port.onmessage({ data: { profile: profiles[0].sound } });
    const params = { rpm: new Float32Array([3000]), load: new Float32Array([1]) };
    const whole = [[new Float32Array(2048)]];
    a.process([], whole, params);
    const collected = [];
    for (const length of [128, 256, 512, 1152]) {
      const output = [[new Float32Array(length)]];
      b.process([], output, params);
      collected.push(...output[0][0]);
    }
    assert.deepEqual([...whole[0][0]], collected);
    b.port.onmessage({ data: { profile: {} } });
    b.process([], whole, params);
    assert.ok(whole[0][0].every((x) => x === 0));
    b.port.onmessage({ data: 'stop' });
    assert.equal(b.process([], whole, params), false);
  } finally {
    for (const [key, value] of [
      ['AudioWorkletProcessor', old.base],
      ['registerProcessor', old.register],
      ['sampleRate', old.rate],
    ]) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('zero-variation reference repeats without a stochastic noise floor at every load', () => {
  const rate = 96000;
  for (const { sound } of profiles)
    for (const load of [0, 0.25, 0.5, 0.75, 1]) {
      const synth = new ExhaustWaveguide(sound, rate, true, { pulseVariation: 0 });
      const lag = (rate * 60 * sound.cycleRevolutions) / 3000;
      const samples = new Float64Array(lag * 3);
      for (let i = 0; i < rate * 2; i++) synth.sample(3000, load);
      for (let i = 0; i < samples.length; i++) samples[i] = synth.sample(3000, load);
      let error = 0,
        power = 0;
      for (let i = lag; i < samples.length; i++) {
        error += (samples[i] - samples[i - lag]) ** 2;
        power += samples[i] ** 2;
      }
      assert.ok(power > 0);
      assert.ok(error / power < 0.001, `unexpected aperiodic energy: ${error / power}`);
    }
});

test('every catalog engine has waveguide authoring and Porsche banks fire evenly', () => {
  assert.equal(profiles.length, VEHICLE_CATALOG.length);
  const sound = profiles.find((entry) => entry.profile.id === '911_TURBO_3_3').sound;
  for (const bank of [0, 1]) {
    const phases = sound.firingPhases.filter((_, i) => sound.exhaust.banks[i] === bank);
    assert.equal(phases.length, 3);
    for (let i = 0; i < phases.length; i++) {
      const interval = (phases[(i + 1) % phases.length] - phases[i] + 1) % 1;
      assert.ok(Math.abs(interval * sound.cycleRevolutions * 360 - 240) < 1e-9);
    }
  }
});

test('pulse rise and decay affect waveform shape, beyond a volume multiplier', () => {
  const sound = VEHICLE_CATALOG[3].sound;
  const normal = render(sound, 1, true, 96000);
  for (const pulse of [
    { ...sound.pulse, riseSeconds: sound.pulse.riseSeconds * 4 },
    { ...sound.pulse, decaySeconds: sound.pulse.decaySeconds * 0.5 },
  ]) {
    const changed = render(compileVehicleAudioProfile({ ...sound, pulse }), 1, true, 96000);
    const ratio = Math.sqrt(energy(normal) / energy(changed));
    assert.ok(
      difference(
        normal,
        changed.map((x) => x * ratio),
      ) >
        energy(normal) * 0.001,
    );
  }
  const closed = render(sound, 0, true, 96000);
  const ratio = Math.sqrt(energy(normal) / energy(closed));
  assert.ok(
    difference(
      normal,
      closed.map((x) => x * ratio),
    ) >
      energy(normal) * 0.001,
  );
});

test('stopping excitation leaves decaying acoustic energy rather than a self-sustaining output', () => {
  for (const { sound } of profiles) {
    const synth = new ExhaustWaveguide(sound, 96000);
    for (let i = 0; i < 96000; i++) synth.sample(3000, 1);
    for (let i = 0; i < 96000 * 3; i++) synth.sample(0, 0);
    let peak = 0;
    for (let i = 0; i < 96000; i++) peak = Math.max(peak, Math.abs(synth.sample(0, 0)));
    assert.ok(peak < 1e-8, `residual energy: ${peak}`);
  }
});

test('RPM changes the settled repetition period while excitation preserves it', () => {
  const sound = VEHICLE_CATALOG[3].sound,
    rate = 96000;
  for (const rpm of [1500, 3000, 6000]) {
    const synth = new ExhaustWaveguide(sound, rate, true, { pulseVariation: 0 });
    for (let i = 0; i < rate * 2; i++) synth.sample(rpm, 0.5);
    const lag = (rate * 60 * sound.cycleRevolutions) / rpm;
    const samples = Float64Array.from({ length: lag * 3 }, () => synth.sample(rpm, 0.5));
    assert.ok(difference(samples.subarray(lag), samples.subarray(0, -lag)) < energy(samples) * 0.001);
    const wrong = Math.round(lag * 0.9);
    assert.ok(difference(samples.subarray(wrong), samples.subarray(0, -wrong)) > energy(samples) * 0.01);
  }
});

test('pulse variation changes strength within bounds while preserving firing timing and mean excitation', () => {
  const sound = profiles.find((entry) => entry.profile.id === 'CORVETTE_C4').sound;
  for (const rate of [88200, 96000])
    for (const coupled of [false, true]) {
      const reference = new ExhaustWaveguide(sound, rate, coupled, { pulseVariation: 0 });
      const varied = new ExhaustWaveguide(sound, rate, coupled, { pulseVariation: 0.3 });
      const replay = new ExhaustWaveguide(sound, rate, coupled, { pulseVariation: 0.3 });
      let sum = 0,
        square = 0,
        events = 0,
        outputDifference = 0;
      for (let i = 0; i < rate * 2; i++) {
        const previous = reference.phase;
        const rpm = i < rate ? 3000 : 6000;
        const load = i < rate ? 0.25 : 1;
        const a = reference.sample(rpm, load),
          b = varied.sample(rpm, load);
        assert.equal(b, replay.sample(rpm, load));
        assert.ok(Number.isFinite(b) && Math.abs(b) < OUTPUT.ceiling);
        assert.equal(varied.phase, reference.phase);
        assert.equal(varied.rpm, reference.rpm);
        outputDifference += (a - b) ** 2;
        for (let cylinder = 0; cylinder < sound.firingPhases.length; cylinder++) {
          const offset = sound.firingPhases[cylinder],
            phase = reference.phase;
          const fired = phase >= previous ? offset > previous && offset <= phase : offset > previous || offset <= phase;
          if (!fired) continue;
          // Observe the actual excitation, independently of pipe filtering and clipping.
          const ratio = varied.pulse[cylinder] / reference.pulse[cylinder];
          assert.ok(ratio >= 0.7 - 1e-12 && ratio <= 1.3 + 1e-12);
          sum += ratio;
          square += (ratio - 1) ** 2;
          events++;
        }
      }
      assert.ok(events > 500);
      assert.ok(Math.abs(sum / events - 1) < 0.025);
      assert.ok(square / events > 0.02);
      assert.ok(outputDifference > 0.01);
    }
});

test('variation retains finite headroom for every engine at the maximum control setting', () => {
  for (const { sound, profile } of profiles)
    for (const rate of [88200, 96000])
      for (const coupled of [false, true]) {
        const synth = new ExhaustWaveguide(sound, rate, coupled, { pulseVariation: 0.3 });
        for (let i = 0; i < rate; i++) {
          const x = synth.sample(profile.powertrain.redlineRpm, i < rate / 2 ? 1 : 0);
          assert.ok(Number.isFinite(x) && Math.abs(x) < OUTPUT.ceiling);
        }
      }
});
