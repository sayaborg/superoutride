import assert from 'node:assert/strict';
import test from 'node:test';
import { tireParameters, TireSynthesis } from '../dist/audio/tire-synthesis.js';
import { publishVehicleTireObservation, observeVehicleTires } from '../dist/physics/vehicle-tire-observation.js';

const rolling = {
  load: 4000,
  slipSpeed: 0,
  longitudinalPower: 0,
  lateralPower: 0,
  utilization: 0.2,
  surface: 'ASPHALT',
};
const sliding = { ...rolling, slipSpeed: 8, longitudinalPower: 24000, utilization: 1.2 };
const energy = (values) => values.reduce((sum, x) => sum + x * x, 0) / values.length;
function render(state, rate = 48000, seed = 123456789) {
  const synth = new TireSynthesis(rate, seed);
  synth.update(tireParameters(state));
  return Float32Array.from({ length: rate }, () => synth.sample()).subarray(rate / 2);
}

test('accepted force/slip products publish watts, retaining directional work and support', () => {
  const vehicle = {};
  const result = observeVehicleTires(vehicle);
  const contact = {
    forceTransmitting: true,
    tireFrameValid: true,
    longitudinalVelocity: 20,
    lateralVelocity: 0,
    surface: { surfaceType: 'ASPHALT' },
  };
  const wheel = { tire: { fx: -2000, fy: 1000, sx: -0.5, sy: 0.25, referenceSpeed: 20 } };
  publishVehicleTireObservation(vehicle, contact, wheel, { ...contact, forceTransmitting: false }, wheel);
  assert.equal(result.front.longitudinalPower, 20000);
  assert.equal(result.front.lateralPower, 5000);
  assert.equal(result.rear.longitudinalPower + result.rear.lateralPower, 0);
  assert.equal(result.rear.surface, 'VOID');
});

test('power controls squeal excitation and direction changes timbre', () => {
  const low = tireParameters({ ...sliding, longitudinalPower: 1000 });
  const high = tireParameters(sliding);
  assert.ok(high.squeal > low.squeal);
  const lateral = tireParameters({ ...sliding, longitudinalPower: 0, lateralPower: 24000 });
  assert.ok(lateral.squeal > high.squeal);
  assert.ok(high.squeal > 0, 'locked or spinning wheels also squeal');
  assert.equal(tireParameters({ ...sliding, utilization: 0.4 }).squeal, 0);
});

test('two independent axle streams are reproducible, bounded and fade through contact recovery', () => {
  for (const rate of [44100, 48000]) {
    const a = render(sliding, rate);
    assert.deepEqual(a, render(sliding, rate));
    assert.notDeepEqual(a, render(sliding, rate, 362436069));
    assert.ok(energy(a) > energy(render(rolling, rate)) * 4);
    const synth = new TireSynthesis(rate, 123456789);
    for (const state of [sliding, { ...sliding, surface: 'DIRT' }, { ...sliding, load: 0 }, rolling]) {
      synth.update(tireParameters(state));
      let previous = synth.sample();
      const tail = new Float32Array(rate);
      for (let i = 0; i < rate; i++) {
        const value = synth.sample();
        assert.ok(Number.isFinite(value) && Math.abs(value) < 0.35);
        assert.ok(Math.abs(value - previous) < 0.3);
        tail[i] = value;
        previous = value;
      }
      if (state.load === 0 || state.slipSpeed === 0) assert.ok(energy(tail.subarray(rate * 0.9)) < 1e-12);
    }
  }
});

test('self-excited tone grows above onset, forms harmonics, and dies below onset', () => {
  for (const rate of [44100, 48000]) {
    const synth = new TireSynthesis(rate, 123456789);
    const tone = { squeal: 0.7, pitch: 850 };
    synth.update(tone);
    const signal = Float64Array.from({ length: rate }, () => synth.sample());
    const first = signal.subarray(0, Math.floor(rate * 0.02));
    const settled = signal.subarray(rate / 2);
    assert.ok(energy(settled) > 0.001, 'a developed tonal oscillation must be audible');
    assert.ok(energy(settled) > energy(first) * 100, 'tone must grow, not start as a full-volume oscillator');
    const band = (center) => {
      let sum = 0;
      for (let hz = center - 20; hz <= center + 20; hz += 4) {
        let re = 0,
          im = 0;
        for (let i = 0; i < settled.length; i++) {
          const w = (2 * Math.PI * hz * i) / rate;
          const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (settled.length - 1));
          re += settled[i] * window * Math.cos(w);
          im += settled[i] * window * Math.sin(w);
        }
        sum += re * re + im * im;
      }
      return sum;
    };
    assert.ok(band(850) > band(1200) * 100);
    assert.ok(band(1700) > band(1450) * 20, 'second harmonic must follow the fundamental');
    synth.update({ ...tone, squeal: 0.04 });
    const below = Float64Array.from({ length: rate }, () => synth.sample());
    assert.ok(
      energy(below.subarray(rate * 0.9)) < energy(settled) * 1e-5,
      'damping must defeat subthreshold excitation',
    );
    synth.update({ ...tone, squeal: 0 });
    const stopped = Float64Array.from({ length: rate }, () => synth.sample());
    assert.ok(energy(stopped.subarray(rate * 0.9)) < 1e-12);
  }
});

test('pitch follows slip/direction while excessive slip can weaken tonal excitation', () => {
  const lateral = { ...sliding, longitudinalPower: 0, lateralPower: 24000 };
  assert.ok(tireParameters(sliding).pitch > tireParameters(lateral).pitch);
  assert.ok(tireParameters({ ...sliding, slipSpeed: 25 }).pitch > tireParameters(sliding).pitch);
  assert.ok(tireParameters({ ...sliding, slipSpeed: 150 }).squeal < tireParameters(sliding).squeal);
  assert.equal(tireParameters({ ...sliding, slipSpeed: 0.1 }).squeal, 0);
});

test('oscillator remains stable through sustained maximum excitation and abrupt pitch changes', () => {
  for (const rate of [44100, 48000, 96000]) {
    const synth = new TireSynthesis(rate, 362436069);
    for (let second = 0; second < 8; second++) {
      synth.update({
        squeal: 1,
        pitch: second % 2 ? 400 : 2400,
      });
      for (let i = 0; i < rate; i++) {
        const value = synth.sample();
        assert.ok(Number.isFinite(value) && Math.abs(value) < 0.35);
        assert.ok(synth.x * synth.x + synth.y * synth.y < 2, 'radial state must remain bounded before output clipping');
      }
    }
  }
});

test('tire worklet preserves both axle signals across block partitions and handles silence/stop', async (t) => {
  const old = Object.getOwnPropertyDescriptors(globalThis);
  let Processor;
  globalThis.AudioWorkletProcessor = class {
    port = {};
  };
  globalThis.sampleRate = 48000;
  globalThis.registerProcessor = (_, value) => {
    Processor = value;
  };
  t.after(() => {
    for (const key of ['AudioWorkletProcessor', 'sampleRate', 'registerProcessor']) {
      if (old[key]) Object.defineProperty(globalThis, key, old[key]);
      else delete globalThis[key];
    }
  });
  await import('../dist/audio/tire-processor.js');
  const data = { front: tireParameters(sliding), rear: tireParameters({ ...sliding, lateralPower: 20000 }) };
  const a = new Processor(),
    b = new Processor();
  const blank = [[new Float32Array(128)]];
  const params = Object.fromEntries(
    Processor.parameterDescriptors.map((d) => [d.name, new Float32Array([d.defaultValue])]),
  );
  a.process([], blank, params);
  assert.ok(blank[0][0].every((x) => x === 0));
  // Match the silent elapsed time: noise phase advances independently of audibility.
  b.process([], blank, params);
  for (const axle of ['front', 'rear'])
    for (const key of ['squeal', 'pitch']) params[`${axle}_${key}`][0] = data[axle][key];
  const whole = [[new Float32Array(4096)]];
  a.process([], whole, params);
  const parts = [];
  for (const length of [1, 127, 256, 3712]) {
    const block = [[new Float32Array(length)]];
    b.process([], block, params);
    parts.push(...block[0][0]);
  }
  assert.deepEqual(parts, [...whole[0][0]]);
  params.front_squeal[0] = params.rear_squeal[0] = NaN;
  const decay = [[new Float32Array(48000)]];
  b.process([], decay, params);
  assert.ok(energy(decay[0][0].subarray(44000)) < 1e-12);
  b.port.onmessage({ data: 'stop' });
  assert.equal(b.process([], blank, params), false);
});

test('ordinary rolling has no audible noise on any supported surface', () => {
  for (const surface of ['ASPHALT', 'SHOULDER', 'GRASS', 'DIRT', 'SAND', 'VOID']) {
    assert.ok(render({ ...rolling, surface }).every((value) => value === 0));
  }
});
