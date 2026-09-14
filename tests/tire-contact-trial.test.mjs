import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ContactMode, DistanceRoughness, TireContactSynthesis } from '../dist/audio/tire-contact-model.js';
import { CONTACT_INPUTS, CONTACT_TEXTURES, CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import { CONTACT_SCENARIOS } from '../tools/tire-contact-scenarios.mjs';

const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
function settled(mode, rate, slip, load) {
  for (let i = 0; i < rate / 2; i++) mode.step(slip, load);
  return Float64Array.from({ length: rate / 2 }, () => mode.step(slip, load));
}

test('contact midpoint has dissipative friction and a discrete energy balance without a clipper', () => {
  for (const rate of [44100, 48000, 96000]) {
    const mode = new ContactMode(rate, CONTACT_ACOUSTICS.frictionMode);
    for (let i = 0; i < 12000; i++) {
      const slip = i < 8000 ? 0.5 : 0;
      const load = i < 10000 ? 5 : 0;
      const rough = i < 4000 ? 0.1 * Math.sin(i * 0.7) : 0;
      const before = mode.energy;
      mode.step(slip, load, rough);
      const v = mode.lastMidpointVelocity;
      const work = ((mode.lastForce + rough) * v - mode.damping * v * v) / rate;
      assert.ok(Math.abs(mode.energy - before - work) < 1e-10);
      assert.ok(mode.lastForce * (slip - v) >= -1e-14);
      if (slip === 0 && rough === 0) assert.ok(mode.energy <= before + 1e-14);
      assert.ok(mode.lastIterations <= CONTACT_ACOUSTICS.maxSolveIterations);
    }
  }
});

test('velocity weakening sustains a tone; sufficient damping, no weakening or no support kills it', () => {
  // Retain the original 4 g causal fixture as well as the current trial. A damping RATIO of .25
  // is not the same physical damping after changing mass. Use the proven slope bound for the new case.
  for (const massKg of [0.004, CONTACT_ACOUSTICS.frictionMode.massKg]) {
    const mode = { ...CONTACT_ACOUSTICS.frictionMode, massKg };
    const f = CONTACT_ACOUSTICS.friction;
    const slopeBound = (5 * 9 * f.drop) / (8 * Math.sqrt(3) * f.weakeningSpeed);
    const enoughDamping = slopeBound / (2 * massKg * 2 * Math.PI * mode.frequencyHz) + 0.1;
    const normal = new ContactMode(48000, mode);
    const damped = new ContactMode(48000, { ...mode, dampingRatio: massKg === 0.004 ? 0.25 : enoughDamping });
    const constant = new ContactMode(48000, mode, { ...f, drop: 0 });
    assert.ok(rms(settled(normal, 48000, 0.5, 5)) > 0.1);
    assert.ok(rms(settled(damped, 48000, 0.5, 5)) < 1e-8);
    assert.ok(rms(settled(constant, 48000, 0.5, 5)) < 1e-8);
    assert.ok(rms(settled(normal, 48000, 0, 0)) < 1e-8);
  }
});

test('the two native sample rates converge toward a finer midpoint reference', () => {
  const values = [44100, 48000, 96000].map((rate) => {
    const samples = settled(new ContactMode(rate, CONTACT_ACOUSTICS.frictionMode), rate, 0.5, 5);
    const crossings = [];
    for (let i = 1; i < samples.length; i++)
      if (samples[i - 1] < 0 && samples[i] >= 0)
        crossings.push((i - samples[i] / (samples[i] - samples[i - 1])) / rate);
    return { rms: rms(samples), hz: (crossings.length - 1) / (crossings.at(-1) - crossings[0]) };
  });
  for (const value of values.slice(0, 2)) {
    assert.ok(Math.abs(value.rms / values[2].rms - 1) < 0.003);
    assert.ok(Math.abs(value.hz / values[2].hz - 1) < 0.002);
  }
});

test('roughness is distance-driven, bounded, seeded, and integrates across cell boundaries', () => {
  const whole = new DistanceRoughness(0.01, 42);
  const halves = new DistanceRoughness(0.01, 42);
  for (let i = 0; i < 5000; i++) {
    const value = whole.sample(0.004);
    const paired = (halves.sample(0.002) + halves.sample(0.002)) / 2;
    assert.ok(Math.abs(value) <= 1);
    assert.ok(Math.abs(value - paired) < 1e-11);
  }
  const stopped = whole.sample(0);
  for (let i = 0; i < 20; i++) assert.equal(whole.sample(0), stopped);
  assert.throws(() => whole.sample(0.011), RangeError);
});

test('trial boundaries reject invalid tuning and own their parameter snapshots', () => {
  for (const rate of [NaN, Infinity, 0, CONTACT_ACOUSTICS.minRate - 1])
    assert.throws(() => new TireContactSynthesis(rate, 42), RangeError);
  assert.throws(
    () => new ContactMode(48000, CONTACT_ACOUSTICS.frictionMode, { ...CONTACT_ACOUSTICS.friction, dynamic: undefined }),
    RangeError,
  );
  const mode = { ...CONTACT_ACOUSTICS.frictionMode };
  const a = new ContactMode(48000, mode),
    b = new ContactMode(48000, mode);
  mode.massKg *= 2;
  for (let i = 0; i < 100; i++) assert.equal(a.step(0.5, 5), b.step(0.5, 5));
  const voice = new TireContactSynthesis(48000, 42);
  for (const invalid of [
    [NaN, 0, 0],
    [0, Infinity, 0],
    [0, 0, -1],
    [101, 0, 0],
    [0, 5, 0],
    [0, 0, 9],
  ])
    assert.throws(() => voice.update(...invalid), RangeError);
  assert.throws(() => new TireContactSynthesis(48000, 42, 'toString'), RangeError);
  assert.throws(() => new ContactMode(48000, { ...mode, massKg: 1e-10 }), RangeError);
});

test('rolling, sliding without travel, standstill and no support are separate causal cases', () => {
  const rolling = new TireContactSynthesis(48000, 42),
    spinning = new TireContactSynthesis(48000, 42);
  const airborne = new TireContactSynthesis(48000, 42),
    rest = new TireContactSynthesis(48000, 42);
  rolling.update(30, 0, 5);
  spinning.update(0, 0.5, 5);
  airborne.update(30, 0.5, 0);
  rest.update(0, 0, 5);
  let roadEnergy = 0,
    spinEnergy = 0;
  for (let i = 0; i < 48000; i++) {
    rolling.sample();
    spinning.sample();
    assert.equal(airborne.sample(), 0);
    assert.equal(rest.sample(), 0);
    assert.equal(rolling.frictionOutput, 0);
    assert.equal(spinning.roadOutput, 0);
    roadEnergy += rolling.roadOutput ** 2;
    spinEnergy += spinning.frictionOutput ** 2;
  }
  assert.ok(roadEnergy > 1e-4);
  assert.ok(spinEnergy > 1);
});

test('front and rear use one model but do not share mutable oscillator or roughness state', () => {
  const a = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.frontSeed);
  const b = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.rearSeed);
  const replay = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.rearSeed);
  a.update(30, 0.5, 5);
  b.update(30, 0.5, 5);
  replay.update(30, 0.5, 5);
  let different = false;
  for (let i = 0; i < 48000; i++) {
    if (i === 24000) a.update(0, 0, 0);
    const av = a.sample(),
      bv = b.sample();
    assert.equal(bv, replay.sample());
    different ||= av !== bv;
  }
  assert.ok(different);
});

test('both textures retain finite unclipped output and decay after abrupt transitions at input corners', () => {
  for (const rate of [44100, 48000, 96000])
    for (const texture of Object.keys(CONTACT_TEXTURES)) {
      const voice = new TireContactSynthesis(rate, 42, texture);
      for (const [travel, slip, load] of [
        [0, 0, 0],
        [100, 4, 8],
        [0, 0.5, 8],
        [100, 0, 8],
        [0, 0, 0],
      ]) {
        voice.update(travel, slip, load);
        for (let i = 0; i < rate / 2; i++) assert.ok(Math.abs(voice.sample()) < 1);
      }
      assert.ok(Math.abs(voice.sample()) < 1e-8);
    }
});

test('diagnostic scenarios and transport remain within the same input authority', async () => {
  for (const scenario of CONTACT_SCENARIOS)
    for (const [, front, rear] of scenario.steps) {
      for (const axle of [front, rear])
        for (const [i, range] of Object.values(CONTACT_INPUTS).entries())
          assert.ok(axle[i] >= range.min && axle[i] <= range.max);
    }
  let Processor;
  const oldBase = globalThis.AudioWorkletProcessor,
    oldRate = globalThis.sampleRate,
    oldRegister = globalThis.registerProcessor;
  try {
    globalThis.sampleRate = 48000;
    globalThis.AudioWorkletProcessor = class {
      port = {};
    };
    globalThis.registerProcessor = (_name, value) => {
      Processor = value;
    };
    await import('../dist/dev/diagnostics/tire-contact-processor.js');
  } finally {
    if (oldBase === undefined) delete globalThis.AudioWorkletProcessor;
    else globalThis.AudioWorkletProcessor = oldBase;
    if (oldRegister === undefined) delete globalThis.registerProcessor;
    else globalThis.registerProcessor = oldRegister;
  }
  try {
    assert.equal(Processor.parameterDescriptors.length, 6);
    const p = Object.fromEntries(
      Processor.parameterDescriptors.map((d) => [
        d.name,
        new Float32Array([d.name.endsWith('load') ? 5 : d.name.endsWith('slipSpeed') ? 0.5 : 30]),
      ]),
    );
    const render = (chunks) => {
      const processor = new Processor();
      const result = [[], [], [], []];
      for (const size of chunks) {
        const outputs = result.map(() => [new Float32Array(size)]);
        assert.equal(processor.process([], outputs, p), true);
        outputs.forEach(([samples], i) => result[i].push(...samples));
      }
      processor.port.onmessage({ data: 'stop' });
      const outputs = result.map(() => [new Float32Array(7).fill(1)]);
      assert.equal(processor.process([], outputs, p), false);
      assert.ok(outputs.every(([samples]) => samples.every((v) => v === 0)));
      return result;
    };
    assert.deepEqual(render([128, 128, 128]), render([17, 111, 1, 127, 128]));
  } finally {
    if (oldRate === undefined) delete globalThis.sampleRate;
    else globalThis.sampleRate = oldRate;
  }
  const production = await readFile(new URL('../src/audio/vehicle-processor.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(production, /contact-trial|diagnostics/);
});
