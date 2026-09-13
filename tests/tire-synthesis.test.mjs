import assert from 'node:assert/strict';
import test from 'node:test';
import { tireParameters, TireSynthesis } from '../dist/audio/tire-synthesis.js';
import { publishVehicleTireObservation, observeVehicleTires } from '../dist/physics/vehicle-tire-observation.js';

const rolling = {
  load: 4000,
  rollingSpeed: 25,
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
    surface: { surfaceType: 'ASPHALT' },
  };
  const wheel = { tire: { fx: -2000, fy: 1000, sx: -0.5, sy: 0.25, referenceSpeed: 20 } };
  publishVehicleTireObservation(vehicle, contact, wheel, { ...contact, forceTransmitting: false }, wheel);
  assert.equal(result.front.longitudinalPower, 20000);
  assert.equal(result.front.lateralPower, 5000);
  assert.equal(result.rear.longitudinalPower + result.rear.lateralPower, 0);
  assert.equal(result.rear.surface, 'VOID');
});

test('power controls loudness, direction blends timbre and rolling remains independent', () => {
  const low = tireParameters({ ...sliding, longitudinalPower: 1000 });
  const high = tireParameters(sliding);
  assert.ok(high.friction > low.friction && high.squeal > low.squeal);
  const lateral = tireParameters({ ...sliding, longitudinalPower: 0, lateralPower: 24000 });
  assert.ok(lateral.squeal > high.squeal && lateral.friction < high.friction);
  assert.ok(high.squeal > 0, 'locked or spinning wheels also squeal');
  assert.equal(high.rolling, low.rolling);
  assert.equal(tireParameters({ ...sliding, utilization: 0.4 }).squeal, 0);
});

test('two independent axle streams are reproducible, bounded and fade through contact recovery', () => {
  for (const rate of [44100, 48000]) {
    const a = render(sliding, rate);
    assert.deepEqual(a, render(sliding, rate));
    assert.notDeepEqual(a, render(sliding, rate, 362436069));
    assert.ok(energy(a) > energy(render(rolling, rate)) * 4);
    const synth = new TireSynthesis(rate, 123456789);
    for (const state of [
      sliding,
      { ...sliding, surface: 'DIRT' },
      { ...sliding, load: 0 },
      rolling,
      { ...rolling, rollingSpeed: 0 },
    ]) {
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
      if (state.load === 0 || state.rollingSpeed === 0) assert.ok(energy(tail.subarray(rate * 0.9)) < 1e-12);
    }
  }
});

test('resonant component concentrates noise around the authored squeal modes', () => {
  const rate = 48000;
  const synth = new TireSynthesis(rate, 123456789);
  synth.update({ rolling: 0, friction: 0, squeal: 0.18, cutoff: 900 });
  const signal = Float64Array.from({ length: rate }, () => synth.sample());
  const band = (center) => {
    let sum = 0;
    for (let hz = center - 40; hz <= center + 40; hz += 5) {
      let re = 0,
        im = 0;
      for (let i = rate / 2; i < rate; i++) {
        const w = (2 * Math.PI * hz * i) / rate;
        re += signal[i] * Math.cos(w);
        im += signal[i] * Math.sin(w);
      }
      sum += re * re + im * im;
    }
    return sum;
  };
  assert.ok(band(1050) > band(700) * 8);
  assert.ok(band(1630) > band(2100) * 4);
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
  a.process([], blank);
  assert.ok(blank[0][0].every((x) => x === 0));
  // Match the silent elapsed time: noise phase advances independently of audibility.
  b.process([], blank);
  for (const p of [a, b]) p.port.onmessage({ data });
  const whole = [[new Float32Array(4096)]];
  a.process([], whole);
  const parts = [];
  for (const length of [1, 127, 256, 3712]) {
    const block = [[new Float32Array(length)]];
    b.process([], block);
    parts.push(...block[0][0]);
  }
  assert.deepEqual(parts, [...whole[0][0]]);
  b.port.onmessage({ data: { front: { squeal: NaN } } });
  const decay = [[new Float32Array(48000)]];
  b.process([], decay);
  assert.ok(energy(decay[0][0].subarray(44000)) < 1e-12);
  b.port.onmessage({ data: 'stop' });
  assert.equal(b.process([], blank), false);
});
