import assert from 'node:assert/strict';
import test from 'node:test';
import { ContactMode, TireContactSynthesis } from '../../dist/audio/tire-contact-model.js';
import {
  CONTACT_ACOUSTICS as A,
  CONTACT_INPUTS,
  CONTACT_TEXTURES,
  CONTACT_TEXTURE_KEYS,
} from '../../dist/audio/tire-contact-acoustics.js';
import { contactTireParameters } from '../../dist/audio/tire-sound-controls.js';

const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const correlation = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0) / (a.length * rms(a) * rms(b));
function measure(mode, rate, slip) {
  for (let i = 0; i < rate; i++) mode.step(slip, 5);
  const values = Float64Array.from({ length: rate }, () => mode.step(slip, 5));
  const crossing = [];
  for (let i = 1; i < values.length; i++)
    if (values[i - 1] < 0 && values[i] >= 0) crossing.push(i - values[i] / (values[i] - values[i - 1]));
  return { hz: (rate * (crossing.length - 1)) / (crossing.at(-1) - crossing[0]), rms: rms(values) };
}

test('surface catalog is unique, complete and stays inside the solver and spatial sample domains', () => {
  const seen = new Set();
  for (const [i, key] of CONTACT_TEXTURE_KEYS.entries()) {
    const t = CONTACT_TEXTURES[key];
    assert.ok(Object.isFrozen(t));
    assert.ok(!seen.has(t.surface));
    seen.add(t.surface);
    const control = contactTireParameters({
      load: 4000,
      referenceLoad: 4000,
      travelSpeed: 30,
      slipSpeed: 3,
      surface: t.surface,
    });
    assert.equal(control.surfaceIndex, i);
    assert.ok(t.frictionDrop >= 0 && t.frictionDrop <= A.friction.drop);
    assert.ok(t.roadRoughness > 0 && t.slipRoughness > 0 && t.roadRate > 0 && t.slipRate > 0);
    assert.ok((CONTACT_INPUTS.travelSpeed.max * t.roadRate) / (A.minRate * A.roadCellMeters) <= 1);
    assert.ok((CONTACT_INPUTS.slipSpeed.max * t.slipRate) / (A.minRate * A.slipCellMeters) <= 1);
  }
  assert.deepEqual([...seen].sort(), ['ASPHALT', 'DIRT', 'GRASS', 'SAND', 'SHOULDER']);
});

test('treble revision preserves mechanical damping and steady velocity while raising nonlinear pitch', () => {
  // Immutable pre-treble calibration; not another runtime default.
  const previous = { massKg: 0.0005, frequencyHz: 800, dampingRatio: 0.03 };
  for (const rate of [44100, 48000, 96000])
    for (const slip of [0.25, 0.5, 0.8]) {
      const a = new ContactMode(rate, previous),
        b = new ContactMode(rate, A.frictionMode);
      assert.ok(Math.abs(a.damping - b.damping) < 1e-14);
      const before = measure(a, rate, slip),
        after = measure(b, rate, slip);
      assert.ok(Math.abs(after.hz / before.hz - 1.5) < 0.01);
      assert.ok(Math.abs(after.rms / before.rms - 1) < 0.01);
    }
});

test('grass dirt and sand have audible energy and distinct normalized road waveforms, not only volume changes', () => {
  const signals = {};
  for (const texture of ['grass', 'dirt', 'sand']) {
    const voice = new TireContactSynthesis(48000, 42, texture);
    voice.update(30, 0, 5);
    for (let i = 0; i < 24000; i++) voice.sample();
    signals[texture] = Float64Array.from({ length: 24000 }, () => {
      voice.sample();
      return voice.roadOutput;
    });
    assert.ok(rms(signals[texture]) > 0.001);
    assert.equal(CONTACT_TEXTURES[texture].frictionDrop, 0);
    // Slip without travel excites the friction vibration even without self-excited squeal.
    voice.update(0, 0.5, 5);
    const friction = Float64Array.from({ length: 24000 }, () => {
      voice.sample();
      return voice.frictionOutput;
    });
    assert.ok(rms(friction) > 1e-4);
  }
  for (const [a, b] of [
    ['grass', 'dirt'],
    ['grass', 'sand'],
    ['dirt', 'sand'],
  ])
    assert.ok(Math.abs(correlation(signals[a], signals[b])) < 0.8);
  assert.ok(rms(signals.dirt) > 2 * rms(signals.grass));
});

test('surface changes smooth physical forcing coefficients directly without resetting stored states', () => {
  const voice = new TireContactSynthesis(48000, 42);
  voice.update(30, 0.5, 5);
  for (let i = 0; i < 10000; i++) voice.sample();
  const oscillator = voice.friction,
    roughness = voice.roadTexture;
  const before = { ...voice.texture };
  const target = CONTACT_TEXTURES.sand;
  voice.update(30, 0.5, 5, CONTACT_TEXTURE_KEYS.indexOf('sand'));
  assert.deepEqual(voice.texture, before);
  voice.sample();
  for (const key of ['roadRoughness', 'slipRoughness', 'frictionDrop', 'roadRate', 'slipRate']) {
    const actual = voice.texture[key];
    const expected = before[key] + (1 - Math.exp(-1 / (A.controlSeconds * 48000))) * (target[key] - before[key]);
    assert.equal(actual, expected);
  }
  assert.equal(voice.friction, oscillator);
  assert.equal(voice.roadTexture, roughness);
  for (let i = 0; i < 10000; i++) {
    voice.update(100, 4, 8, i % CONTACT_TEXTURE_KEYS.length);
    assert.ok(Number.isFinite(voice.sample()));
  }
  voice.update(100, 4, 0);
  for (let i = 0; i < 24000; i++) voice.sample();
  assert.ok(Math.abs(voice.sample()) < 1e-8);
});
