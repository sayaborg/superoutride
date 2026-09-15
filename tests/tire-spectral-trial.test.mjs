import assert from 'node:assert/strict';
import test from 'node:test';
import { SpectralBand, TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_INPUTS, SPECTRAL_SETTINGS } from '../dist/audio/tire-spectral-acoustics.js';
import {
  SPECTRAL_SCENARIOS,
  spectralScenarioAt,
  spectralReferenceObservation,
} from '../tools/tire-spectral-scenarios.mjs';

const input = (values = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 4,
  wheelSpeed: 25,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 12000,
  demand: 1.5,
  ...values,
});
function render(kernel, count) {
  const result = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    kernel.sample();
    result[i] = kernel.scrubOutput + kernel.squealOutput;
  }
  return result;
}
const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

test('spectral band analytic normalization is insensitive to bandwidth and sample rate', () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const width of [50, 300, 2000]) {
      const band = new SpectralBand(rate, 123456789);
      band.configure(1500, width);
      for (let i = 0; i < rate / 2; i++) band.sample(0.2);
      let sum = 0;
      for (let i = 0; i < rate * 4; i++) sum += band.sample(0.2) ** 2;
      const measured = Math.sqrt(sum / (rate * 4));
      assert.ok(Math.abs(measured / 0.2 - 1) < 0.12, `${rate}/${width}: ${measured}`);
    }
  }
});

test('zero excitation contracts existing band state exactly, including frequency retargeting', () => {
  const rate = 48000,
    width = 50;
  const band = new SpectralBand(rate, 91);
  band.configure(1200, width);
  for (let i = 0; i < 1000; i++) band.sample(0.1);
  const before = band.squaredNorm;
  band.configure(3900, width);
  for (let i = 0; i < 2400; i++) band.sample(0);
  const expected = before * Math.exp((-2 * Math.PI * width * 2400) / rate);
  assert.ok(Math.abs(band.squaredNorm / expected - 1) < 1e-10);
  assert.ok(band.squaredNorm < before * 1e-6);
});

test('band temporal correlation follows r^lag cos(theta*lag), not an undamped periodic oscillator', () => {
  const rate = 48000,
    frequency = 1500,
    width = 300;
  const band = new SpectralBand(rate, 71);
  band.configure(frequency, width);
  const samples = Float64Array.from({ length: rate * 3 }, () => band.sample(0.1));
  for (const lag of [8, 16, 32, 320]) {
    let cross = 0,
      energy = 0;
    for (let i = rate; i < samples.length; i++) {
      cross += samples[i] * samples[i - lag];
      energy += samples[i] ** 2;
    }
    const expected = Math.exp((-Math.PI * width * lag) / rate) * Math.cos((2 * Math.PI * frequency * lag) / rate);
    assert.ok(Math.abs(cross / energy - expected) < 0.045);
  }
});

test('band and kernel reject unsupported domains without poisoning later finite output', () => {
  for (const rate of [0, 22050, 44100.5, 192001, NaN, Infinity])
    assert.throws(() => new TireSpectralSynthesis(rate), RangeError);
  for (const seed of [0, -1, 0.5, 0x100000000]) assert.throws(() => new TireSpectralSynthesis(48000, seed), RangeError);
  const band = new SpectralBand(48000, 1);
  for (const args of [
    [0, 50],
    [22000, 50],
    [1000, 0],
    [1000, 6001],
    [NaN, 50],
  ])
    assert.throws(() => band.configure(...args), RangeError);
  for (const a of [NaN, Infinity, -1, 1.1]) assert.throws(() => band.sample(a), RangeError);
  const kernel = new TireSpectralSynthesis(48000);
  kernel.update(input());
  render(kernel, 4800);
  for (const key of Object.keys(SPECTRAL_INPUTS)) {
    for (const value of [NaN, Infinity, SPECTRAL_INPUTS[key].max + 1]) {
      assert.throws(() => kernel.update(input({ [key]: value })), RangeError);
      assert.ok(Number.isFinite(kernel.sample()));
    }
  }
  kernel.update(input());
  assert.ok(rms(render(kernel, 4800)) > 0.01);
});

test('retained S/Q taps are silent at zero slip; stationary wheelspin remains audible', () => {
  const kernel = new TireSpectralSynthesis(48000);
  assert.ok(render(kernel, 1000).every((v) => v === 0));
  kernel.update(input({ lateralVelocity: 0, lateralPower: 0, demand: 0 }));
  assert.ok(render(kernel, 1000).every((v) => v === 0));
  kernel.update(
    input({
      longitudinalVelocity: 0,
      lateralVelocity: 0,
      wheelSpeed: 20,
      longitudinalPower: 60000,
      lateralPower: 0,
      demand: 3,
    }),
  );
  assert.ok(rms(render(kernel, 4800)) > 0.01);
});

test('loss of support cuts excitation, preserves a tail, then permits recontact', () => {
  for (const rate of [44100, 48000, 192000]) {
    const kernel = new TireSpectralSynthesis(rate);
    kernel.update(input());
    render(kernel, rate / 2);
    kernel.update(input({ load: 0 }));
    const first = render(kernel, Math.round(rate * 0.01));
    assert.ok(rms(first) > 1e-5, 'do not zero stored state');
    render(kernel, Math.round(rate * 0.19));
    assert.ok(rms(render(kernel, Math.round(rate * 0.02))) < 1e-8, 'tail does not keep receiving excitation');
    kernel.update(input());
    assert.ok(rms(render(kernel, Math.round(rate * 0.1))) > 0.01);
  }
});

test('finite heads and unclipped raw outputs over declared domain corners and abrupt transitions', () => {
  for (const rate of [44100, 48000, 192000]) {
    const kernel = new TireSpectralSynthesis(rate);
    for (const sign of [-1, 1])
      for (const speed of [0, 100])
        for (const demand of [0, 1, 50]) {
          kernel.update(
            input({
              longitudinalVelocity: sign * speed,
              lateralVelocity: -sign * speed,
              wheelSpeed: -sign * 200,
              longitudinalPower: 1000000,
              lateralPower: 1000000,
              load: 30000,
              demand,
            }),
          );
          const values = render(kernel, Math.round(rate * 0.08));
          assert.ok(values.every((v) => Number.isFinite(v) && Math.abs(v) < 0.8));
        }
  }
});

test('control repeats and render-block partitions do not change the native-rate stream', () => {
  for (const rate of [44100, 48000]) {
    const a = new TireSpectralSynthesis(rate),
      b = new TireSpectralSynthesis(rate);
    const value = input();
    a.update(value);
    b.update(value);
    const expected = render(a, 12000),
      actual = [];
    for (const size of [1, 127, 13, 511, 11348]) {
      b.update({ ...value });
      actual.push(...render(b, size));
    }
    assert.deepEqual(Float64Array.from(actual), expected);
  }
});

test('caller mutation, neighboring streams and random seeds cannot couple independent contacts', () => {
  const a = new TireSpectralSynthesis(48000),
    b = new TireSpectralSynthesis(48000);
  const third = new TireSpectralSynthesis(48000, 924783);
  const value = input();
  a.update(value);
  b.update(input());
  third.update(input());
  value.load = 0;
  const x = [],
    y = [],
    z = [];
  for (let i = 0; i < 12000; i++) {
    x.push(a.sample());
    z.push(third.sample());
    y.push(b.sample());
  }
  assert.deepEqual(x, y);
  assert.notDeepEqual(x, z);
  assert.ok(rms(z) > 0.01);
});

test('squeal demand is nondecreasing under fixed other controls; scrub does not inherit demand', () => {
  let previous = 0;
  let scrub;
  for (const demand of [0, 0.1, 0.5, 1, 2, 10, 50]) {
    const kernel = new TireSpectralSynthesis(48000);
    kernel.update(input({ demand }));
    render(kernel, 4800);
    const q = [],
      s = [];
    for (let i = 0; i < 4800; i++) {
      kernel.sample();
      q.push(kernel.squealOutput);
      s.push(kernel.scrubOutput);
    }
    assert.ok(rms(q) >= previous);
    previous = rms(q);
    if (scrub) assert.deepEqual(s, scrub);
    else scrub = s;
  }
});

test('same scalar slip in lock and spin retains wheel-speed contrast; mirrored travel is symmetric', () => {
  const lock = input({
    longitudinalVelocity: 20,
    wheelSpeed: 0,
    lateralVelocity: 0,
    longitudinalPower: 60000,
    lateralPower: 0,
    demand: 3,
  });
  const spin = { ...lock, wheelSpeed: 40 };
  const a = new TireSpectralSynthesis(48000),
    b = new TireSpectralSynthesis(48000),
    c = new TireSpectralSynthesis(48000);
  a.update(lock);
  b.update(spin);
  c.update({ ...lock, longitudinalVelocity: -20 });
  const x = render(a, 9600);
  assert.notDeepEqual(x, render(b, 9600));
  assert.deepEqual(x, render(c, 9600));
  assert.deepEqual(spectralReferenceObservation(lock), spectralReferenceObservation(spin));
});

test('shared synthetic scenarios are finite and preserve explicit loss-of-support steps', () => {
  for (const scene of SPECTRAL_SCENARIOS) {
    const kernel = new TireSpectralSynthesis(48000);
    for (let frame = 0; frame < scene.seconds * 60; frame++) {
      kernel.update(spectralScenarioAt(scene, frame / 60));
      assert.ok(Number.isFinite(kernel.sample()));
    }
  }
  const scene = SPECTRAL_SCENARIOS.find((v) => v.id === 'release-recontact');
  assert.equal(spectralScenarioAt(scene, 1.999).load, 4000);
  assert.equal(spectralScenarioAt(scene, 2).load, 0);
  assert.equal(spectralScenarioAt(scene, 3).load, 4000);
});

test('two-tap worklet processor under host stub matches kernel and handles invalid controls, stop and late messages', async (t) => {
  let Processor;
  const globals = {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = {};
    },
    registerProcessor: (name, type) => {
      assert.equal(name, 'tire-spectral-trial');
      Processor = type;
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => (previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]));
  }
  await import('../dist/dev/diagnostics/tire-spectral-processor.js');
  assert.equal(Processor.parameterDescriptors.length, Object.keys(SPECTRAL_INPUTS).length);
  assert.ok(Processor.parameterDescriptors.every((p) => p.automationRate === 'k-rate'));
  const processor = new Processor(),
    kernel = new TireSpectralSynthesis(48000);
  const parameters = Object.fromEntries(
    Object.entries(input()).map(([key, value]) => [key, new Float32Array([value])]),
  );
  kernel.update(input());
  for (let block = 0; block < 5; block++) {
    const outputs = [[new Float32Array(128)], [new Float32Array(128)]];
    assert.equal(processor.process([], outputs, parameters), true);
    for (let i = 0; i < 128; i++) {
      kernel.sample();
      assert.equal(outputs[0][0][i], Math.fround(kernel.scrubOutput));
      assert.equal(outputs[1][0][i], Math.fround(kernel.squealOutput));
    }
  }
  parameters.load[0] = NaN;
  for (let i = 0; i < 100; i++)
    assert.equal(processor.process([], [[new Float32Array(128)], [new Float32Array(128)]], parameters), true);
  processor.port.onmessage({ data: 'stop' });
  processor.port.onmessage({ data: 'start' });
  const output = [[new Float32Array(16).fill(1)], [new Float32Array(16).fill(1)]];
  assert.equal(processor.process([], output, parameters), false);
  assert.ok(output.flat().every((v) => v.every((sample) => sample === 0)));
  assert.equal(processor.process([], [], {}), false);
  assert.equal(SPECTRAL_SETTINGS.harmonicWeights.length, 4);
});

test('split random streams do not share short-lag excitation between scrub and squeal', () => {
  for (const rate of [44100, 48000]) {
    const kernel = new TireSpectralSynthesis(rate);
    kernel.update(
      input({
        longitudinalVelocity: 20,
        wheelSpeed: 0,
        lateralVelocity: 0,
        longitudinalPower: 60000,
        lateralPower: 0,
        demand: 3,
      }),
    );
    render(kernel, rate / 2);
    let cross = 0,
      a2 = 0,
      b2 = 0;
    for (let i = 0; i < rate * 3; i++) {
      kernel.sample();
      const a = kernel.scrubOutput,
        b = kernel.squealOutput;
      cross += a * b;
      a2 += a * a;
      b2 += b * b;
    }
    // The original adjacent-state seeding produces about 0.24 here. A new source must
    // not obtain apparent richness by reusing neighboring samples across its bands.
    assert.ok(Math.abs(cross / Math.sqrt(a2 * b2)) < 0.06);
  }
});
