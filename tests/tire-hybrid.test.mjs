import assert from 'node:assert/strict';
import test from 'node:test';
import { TireHybridSynthesis, HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-model.js';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { TireSynthesis, tireParameters } from '../dist/audio/tire-synthesis.js';
import { SPECTRAL_SETTINGS, SPECTRAL_TEXTURES } from '../dist/audio/tire-spectral-acoustics.js';
import { CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import { spectralReferenceObservation } from '../tools/tire-spectral-scenarios.mjs';

const input = (extra = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 6,
  wheelSpeed: 25,
  wheelAngularSpeed: 25 / 0.3,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 24000,
  demand: 1.5,
  ...extra,
});
const currentControl = (value, surfaceIndex = 0) =>
  tireParameters({
    ...spectralReferenceObservation(value),
    surface: SPECTRAL_TEXTURES[surfaceIndex].surface,
  });
const hybrid = (rate = 48000, seed = SPECTRAL_SETTINGS.seed, controlSeed = CONTACT_ACOUSTICS.frontSeed) =>
  new TireHybridSynthesis(rate, seed, controlSeed);
const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const render = (k, count) => Float64Array.from({ length: count }, () => k.sample());

test('HYBRID advances exactly the CURRENT amplitude and smoothed pitch, including onset and grip recovery', () => {
  for (const rate of [44100, 48000]) {
    const h = hybrid(rate),
      current = new TireSynthesis(rate, CONTACT_ACOUSTICS.frontSeed);
    for (const [excitation, pitch] of [
      [0, 900],
      [0.05, 800],
      [0.8, 1050],
      [0.3, 1200],
      [0, 650],
      [0.65, 900],
    ]) {
      const controls = { squeal: excitation, pitch };
      current.update(controls);
      h.update(input(), controls);
      for (let i = 0; i < rate / 4; i++) {
        current.sample();
        h.sample();
        assert.equal(h.controller.amplitude, current.amplitude, 'one shared dynamics step per sample');
        assert.equal(h.controller.frequency, current.frequency, 'no second pitch envelope');
      }
    }
  }
});

test('HYBRID preserves every SPECTRAL R sample through rotation, support, reverse and material changes', () => {
  for (const rate of [44100, 48000])
    for (const seed of [SPECTRAL_SETTINGS.seed, SPECTRAL_SETTINGS.rearSeed]) {
      const h = hybrid(rate, seed),
        spectral = new TireSpectralSynthesis(rate, seed);
      for (const [wheel, load, surface] of [
        [0, 4000, 0],
        [25, 4000, 0],
        [-40, 5000, 4],
        [0, 4000, 1],
        [30, 0, 3],
        [30, 4000, 2],
        [5, 4000, 0],
      ]) {
        const value = input({ wheelSpeed: wheel, wheelAngularSpeed: wheel / 0.3, load });
        h.update(value, currentControl(value, surface), surface);
        spectral.update(value, surface);
        for (let i = 0; i < rate / 5; i++) {
          h.sample();
          spectral.sample();
          assert.equal(h.roadOutput, spectral.roadOutput);
        }
      }
    }
});

test('CURRENT growth controls finite-width harmonics: weak onset is dark and recovery releases upper bands', () => {
  const h = hybrid();
  h.update(input(), { squeal: 0.7, pitch: 900 });
  const onset = render(h, 480),
    strong = render(h, 48000).slice(24000);
  assert.ok(rms(strong) > rms(onset) * 10);
  assert.ok(h.controller.amplitude > HYBRID_SETTINGS.harmonicAmplitudeReference);
  const energy = [0, 0, 0, 0];
  for (let i = 0; i < 48000; i++) {
    h.sample();
    h.bands.forEach((b, j) => {
      energy[j] += b.squaredNorm;
    });
  }
  const weights = SPECTRAL_SETTINGS.harmonicWeights;
  for (let j = 1; j < 4; j++) {
    const ratio = energy[j] / energy[0],
      expected = (weights[j] / weights[0]) ** 2;
    assert.ok(ratio > expected * 0.65 && ratio < expected * 1.4, 'strong spectral palette');
  }
  for (let j = 0; j < 4; j++) {
    const band = h.bands[j],
      hz = (Math.atan2(band.sine, band.cosine) * 48000) / (2 * Math.PI);
    assert.ok(Math.abs(hz / (j + 1) - (900 + HYBRID_SETTINGS.pitchOffsetHz)) < 25);
    assert.ok(Math.hypot(band.cosine, band.sine) < 1, 'finite width rather than a pure oscillator');
  }
  const before = h.controller.amplitude;
  h.update(input(), { squeal: 0, pitch: 900 });
  h.sample();
  assert.ok(h.controller.amplitude > before * 0.99, 'no instantaneous envelope replacement');
  render(h, 24000);
  let qEnergy = 0;
  for (let i = 0; i < 24000; i++) {
    h.sample();
    qEnergy += h.squealOutput ** 2;
  }
  assert.ok(qEnergy / 24000 < 1e-10, 'Q releases even while R continues');
  assert.ok(Math.abs(h.roadOutput) > 0);
});

test('R plus Q really omits S: locked subthreshold friction has no broad scrub fallback', () => {
  const value = input({ wheelSpeed: 0, wheelAngularSpeed: 0, demand: 0.4 });
  const h = hybrid(),
    spectral = new TireSpectralSynthesis(48000);
  h.update(value, currentControl(value));
  spectral.update(value);
  assert.ok(render(h, 48000).every((v) => v === 0));
  render(spectral, 24000);
  assert.ok(rms(render(spectral, 4800)) > 0.001, 'the reference still has the omitted friction texture');
  assert.equal(h.bands.length, 4);
  assert.equal('scrubOutput' in h, false);
  const spin = input({
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 30,
    wheelAngularSpeed: 100,
    longitudinalPower: 0,
    lateralPower: 0,
    demand: 0,
  });
  h.update(spin, currentControl(spin));
  assert.ok(rms(render(h, 24000)) > 0.001);
  assert.equal(h.squealOutput, 0);
});

test('HYBRID releases invalid/unsupported inputs, keeps independent histories and resumes finitely across domains', () => {
  for (const rate of [44100, 48000, 96000, 192000]) {
    const a = hybrid(rate),
      b = hybrid(rate, SPECTRAL_SETTINGS.rearSeed, CONTACT_ACOUSTICS.rearSeed);
    for (const index of [0, 4, 2, 3, 1, 0]) {
      const value = input({
        longitudinalVelocity: -100,
        lateralVelocity: 100,
        wheelSpeed: 200,
        wheelAngularSpeed: 1000,
        load: 30000,
        longitudinalPower: 1000000,
        lateralPower: 1000000,
        demand: 50,
      });
      for (const k of [a, b]) k.update(value, { squeal: 1, pitch: 2400 }, index);
      for (let i = 0; i < rate / 10; i++) {
        const mixed = a.sample() + b.sample();
        assert.ok(Number.isFinite(mixed) && Math.abs(mixed) < 1);
      }
    }
    assert.notEqual(a.bands[0], b.bands[0]);
    a.update(input({ load: 0 }), { squeal: 1, pitch: 2400 });
    assert.ok(rms(render(a, rate / 100)) > 0, 'a finite release tail remains');
    render(a, rate * 2);
    assert.ok(rms(render(a, 128)) < 1e-10);
    for (const invalid of [NaN, Infinity, -1]) {
      a.update(input(), { squeal: 0.8, pitch: 900 });
      render(a, rate / 4);
      assert.throws(() => a.update(input({ load: invalid }), { squeal: 0.8, pitch: 900 }), RangeError);
      render(a, rate * 2);
      assert.ok(rms(render(a, 128)) < 1e-10);
    }
    assert.throws(() => a.update(input(), { squeal: NaN, pitch: 900 }), RangeError);
    assert.throws(() => a.update(input(), { squeal: 0.8, pitch: 900 }, 0.5), RangeError);
    a.update(input(), { squeal: 0.8, pitch: 900 });
    assert.ok(rms(render(a, rate / 2)) > 0.01);
  }
});
