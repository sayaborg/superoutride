import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
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

test('settled pulse-only exhaust repeats without a stochastic noise floor at every load', () => {
  const rate = 96000;
  for (const { sound } of profiles)
    for (const load of [0, 0.25, 0.5, 0.75, 1]) {
      const synth = new ExhaustWaveguide(sound, rate);
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
