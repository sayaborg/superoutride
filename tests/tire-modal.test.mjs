import assert from 'node:assert/strict';
import test from 'node:test';
import { StochasticResonator } from '../dist/audio/stochastic-resonator.js';
import { TireModalSynthesis } from '../dist/audio/tire-modal-model.js';
import { MODAL_SETTINGS } from '../dist/audio/tire-modal-acoustics.js';
import { TIRE_SOUND_INPUTS, TIRE_SOUND_SURFACES } from '../dist/audio/tire-sound-observation.js';

const input = (extra = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 10,
  wheelSpeed: 25,
  wheelAngularSpeed: 25 / 0.3,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 60000,
  demand: 1.5,
  ...extra,
});
function measure(kernel, count) {
  let energy = 0,
    peak = 0;
  for (let i = 0; i < count; i++) {
    const output = kernel.sample();
    assert.ok(Number.isFinite(output));
    assert.equal(output, kernel.frictionOutput);
    peak = Math.max(peak, Math.abs(output));
    if (i >= count / 2) energy += output ** 2;
  }
  return { rms: Math.sqrt((2 * energy) / count), peak };
}

test('MODAL has only Q: ordinary rolling, no support, no slip or no work cannot excite sound', () => {
  for (const rate of [44100, 48000, 192000]) {
    for (const value of [input({ load: 0 }), input({ lateralVelocity: 0 }), input({ lateralPower: 0 })]) {
      const kernel = new TireModalSynthesis(rate);
      kernel.update(value);
      assert.deepEqual(measure(kernel, 4096), { rms: 0, peak: 0 });
      assert.equal(kernel.vibrationNorm, 0);
      for (const key of ['rolling', 'roadOutput', 'scrubOutput', 'energy']) assert.equal(key in kernel, false);
    }
  }
});

test('weak positive work produces proportional Q without a minimum-speed or demand gate', () => {
  for (const rate of [44100, 48000, 96000]) {
    let previous;
    for (const power of [1, 4, 16]) {
      const kernel = new TireModalSynthesis(rate);
      kernel.update(input({ lateralVelocity: 0.1, lateralPower: power, demand: 0 }));
      const { rms } = measure(kernel, rate);
      assert.ok(rms > 0);
      if (previous) assert.ok(rms / previous > 3.9 && rms / previous < 4.1);
      previous = rms;
    }
  }
});

test('locked sliding and supported stationary spin excite the same Q mechanism', () => {
  for (const value of [
    input({ wheelSpeed: 0, wheelAngularSpeed: 0, lateralVelocity: 0, lateralPower: 0, longitudinalPower: 12000 }),
    input({ longitudinalVelocity: 0, wheelSpeed: 25, lateralVelocity: 0, lateralPower: 0, longitudinalPower: 12000 }),
  ]) {
    const kernel = new TireModalSynthesis(48000);
    kernel.update(value);
    assert.ok(measure(kernel, 48000).rms > 0.001);
  }
});

test('accepted work is used once; supported load and demand are not additional excitation factors', () => {
  const reference = new TireModalSynthesis(48000),
    light = new TireModalSynthesis(48000);
  reference.update(Object.freeze(input()));
  light.update(input({ load: 1000, demand: 0, wheelAngularSpeed: 0 }));
  for (let i = 0; i < 24000; i++) assert.equal(reference.sample(), light.sample());
});

test('axle histories are independent when one input becomes invalid', () => {
  const front = new TireModalSynthesis(48000),
    rear = new TireModalSynthesis(48000, MODAL_SETTINGS.rearSeed);
  const reference = new TireModalSynthesis(48000, MODAL_SETTINGS.rearSeed);
  for (const kernel of [front, rear, reference]) kernel.update(input());
  let distinct = false;
  for (let i = 0; i < 24000; i++) {
    const value = rear.sample();
    assert.equal(value, reference.sample());
    const frontValue = front.sample();
    distinct ||= frontValue !== value;
  }
  assert.ok(distinct);
  assert.throws(() => front.update(input({ load: NaN })), RangeError);
  for (let i = 0; i < 12000; i++) {
    front.sample();
    assert.equal(rear.sample(), reference.sample());
  }
});

test('release immediately removes excitation, retains vibration and recovers after invalid inputs', () => {
  for (const release of [
    input({ load: 0 }),
    input({ lateralVelocity: 0 }),
    input({ lateralPower: 0 }),
    input({ lateralPower: NaN }),
    input({ demand: -1 }),
  ]) {
    const kernel = new TireModalSynthesis(48000);
    kernel.update(input());
    measure(kernel, 24000);
    const before = kernel.vibrationNorm;
    if (!Number.isFinite(release.lateralPower) || release.demand < 0)
      assert.throws(() => kernel.update(release), RangeError);
    else kernel.update(release);
    assert.equal(kernel.vibrationNorm, before, 'no reset or step in the stored sound state');
    for (let i = 0; i < 2000; i++) {
      const norm = kernel.vibrationNorm;
      kernel.sample();
      assert.ok(kernel.vibrationNorm <= norm, 'unforced dynamics must dissipate');
    }
    assert.ok(measure(kernel, 24000).rms < 1e-12);
    kernel.update(input());
    assert.ok(measure(kernel, 24000).rms > 0.001);
    assert.throws(() => kernel.update(input(), 0.5), RangeError);
    assert.ok(measure(kernel, 24000).rms < 1e-12);
  }
});

test('same observations and seed reproduce PCM; reversed signs, demand and post-update mutations do not alter Q', () => {
  const a = new TireModalSynthesis(44100),
    b = new TireModalSynthesis(44100);
  const values = input();
  a.update(values);
  b.update(
    input({
      longitudinalVelocity: -25,
      lateralVelocity: -10,
      wheelSpeed: -25,
      wheelAngularSpeed: -25 / 0.3,
      demand: 0,
    }),
  );
  values.lateralPower = NaN;
  for (let i = 0; i < 44100; i++) assert.equal(a.sample(), b.sample());
  const rear = new TireModalSynthesis(44100, MODAL_SETTINGS.rearSeed);
  rear.update(input());
  assert.notEqual(rear.sample(), a.sample());
});

test('all surfaces, signed-domain endpoints and contact transitions remain finite with fixed default headroom', () => {
  for (const rate of [44100, 48000, 96000, 192000]) {
    const kernel = new TireModalSynthesis(rate);
    const bounds = ['min', 'max'].map((side) =>
      Object.fromEntries(Object.entries(TIRE_SOUND_INPUTS).map(([k, v]) => [k, v[side]])),
    );
    for (let surface = 0; surface < TIRE_SOUND_SURFACES.length; surface++) {
      for (const value of [
        input(),
        ...bounds,
        input({ load: 0 }),
        input({ longitudinalVelocity: -100, wheelSpeed: 200 }),
      ]) {
        kernel.update(value, surface);
        assert.ok(measure(kernel, 4096).peak < 0.5, 'two default axles retain raw headroom');
      }
    }
  }
});

test('native rates retain comparable settled Q levels without output normalization', () => {
  for (const value of [input({ lateralVelocity: 1, lateralPower: 1000 }), input()]) {
    const levels = [44100, 48000, 96000, 192000].map((rate) => {
      const kernel = new TireModalSynthesis(rate);
      kernel.update(value);
      return measure(kernel, 2 * rate).rms;
    });
    assert.ok(Math.max(...levels) / Math.min(...levels) < 1.15, `rate convergence: ${levels}`);
  }
});

test('resonator instability is genuine: a seeded vibration survives removal of noise only above threshold', () => {
  for (const rate of [44100, 48000, 96000]) {
    const steady = [];
    for (const feedback of [0.8, 1.8]) {
      const band = new StochasticResonator(rate, 4, 12345);
      band.configure(1200, 80, feedback, 0.01);
      for (let i = 0; i < rate / 10; i++) band.sample();
      band.configure(1200, 80, feedback, 0);
      for (let i = 0; i < rate; i++) band.sample();
      steady.push(band.squaredNorm);
    }
    assert.ok(steady[0] < 1e-20);
    assert.ok(Math.abs(steady[1] - 0.2) < 0.005, 'continuous normal-form equilibrium within native-step error');
  }
});

test('passive stochastic resonator has the authored linear noise variance before cubic loss', () => {
  for (const rate of [44100, 96000]) {
    const band = new StochasticResonator(rate, 4, 12345);
    band.configure(1200, 80, 0, 0.001);
    let energy = 0;
    for (let i = 0; i < 2 * rate; i++) {
      const value = band.sample();
      if (i >= rate) energy += value ** 2;
    }
    assert.ok(Math.abs(Math.sqrt(energy / rate) / 0.001 - 1) < 0.12);
  }
});

test('exactly balanced feedback has a finite noise covariance and continuous nearby response', () => {
  const bands = [1 - 1e-10, 1, 1 + 1e-10].map((feedback) => {
    const band = new StochasticResonator(48000, 4, 12345);
    band.configure(1200, 80, feedback, 0.1);
    return band;
  });
  for (let i = 0; i < 12000; i++) {
    const values = bands.map((band) => band.sample());
    assert.ok(values.every(Number.isFinite));
    assert.ok(Math.max(...values) - Math.min(...values) < 1e-8);
  }
});

test('stochastic resonator rejects invalid construction and coefficients', () => {
  for (const rate of [0, 44099, 192001, NaN, 48000.5])
    assert.throws(() => new StochasticResonator(rate, 4, 1), RangeError);
  for (const saturation of [0, -1, NaN, Infinity])
    assert.throws(() => new StochasticResonator(48000, saturation, 1), RangeError);
  const band = new StochasticResonator(48000, 4, 1);
  for (const values of [
    [0, 80, 1, 0.1],
    [24000, 80, 1, 0.1],
    [1200, 0, 1, 0.1],
    [1200, 80, NaN, 0.1],
    [1200, 80, 1, -1],
  ])
    assert.throws(() => band.configure(...values), RangeError);
});
