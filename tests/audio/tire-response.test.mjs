import assert from 'node:assert/strict';
import test from 'node:test';
import { TireSpectralSynthesis } from '../../dist/audio/tire-spectral-model.js';
import { SPECTRAL_SETTINGS, SPECTRAL_TEXTURES } from '../../dist/audio/tire-spectral-acoustics.js';
import { TIRE_SOUND_INPUTS } from '../../dist/audio/tire-sound-observation.js';

const input = (changes = {}) => ({
  longitudinalVelocity: 30,
  lateralVelocity: 4,
  wheelSpeed: 30,
  wheelAngularSpeed: 100,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 12000,
  demand: 1.5,
  ...changes,
});
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
function render(k, n, tap = 'squealOutput') {
  return Float64Array.from({ length: n }, () => {
    k.sample();
    return k[tap];
  });
}
function bandEnergy(k, n) {
  const e = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    k.sample();
    for (let h = 0; h < 4; h++) e[h] += k.bands[h + 2].squaredNorm / 2 / n;
  }
  return e;
}

test('R center bands and texture follow accepted angular speed, not translation or slide', () => {
  for (const rate of [44100, 48000, 96000]) {
    const a = new TireSpectralSynthesis(rate),
      b = new TireSpectralSynthesis(rate);
    a.update(input({ longitudinalVelocity: 10 }));
    b.update(input({ longitudinalVelocity: -80, lateralVelocity: 50 }));
    assert.deepEqual(render(a, rate / 2, 'roadOutput'), render(b, rate / 2, 'roadOutput'));
    const freq = (k, i) => (Math.atan2(k.bands[i].sine, k.bands[i].cosine) * rate) / (2 * Math.PI);
    const first = freq(a, 6);
    assert.ok(Math.abs(first - (SPECTRAL_SETTINGS.roadLowOrder * 100) / (2 * Math.PI)) < 1e-6);
    a.update(input({ wheelAngularSpeed: 200 }));
    render(a, rate / 2);
    assert.ok(
      Math.abs(freq(a, 6) / first - 2) < 1e-7,
      'wheel rate doubling moves the spectral envelope, not just gain',
    );
    assert.ok(
      Math.abs(freq(a, 7) / freq(a, 6) - SPECTRAL_SETTINGS.roadHighOrder / SPECTRAL_SETTINGS.roadLowOrder) < 1e-9,
    );
    const stopped = new TireSpectralSynthesis(rate);
    stopped.update(input({ wheelSpeed: 0, wheelAngularSpeed: 0, longitudinalPower: 60000 }));
    assert.ok(render(stopped, rate / 4, 'roadOutput').every((x) => x === 0));
    assert.ok(rms(render(stopped, rate / 4, 'scrubOutput')) > 0.01, 'locked friction remains in S');
  }
});

test('finest rolling texture and maximum accepted angular speed stay within the interpolation cell domain', () => {
  const smallest = Math.min(...SPECTRAL_TEXTURES.map((t) => t.scaleMeters));
  const cycles =
    (SPECTRAL_SETTINGS.roadTextureOrders * TIRE_SOUND_INPUTS.wheelAngularSpeed.max) /
    (2 * Math.PI * smallest * SPECTRAL_SETTINGS.controlHz);
  assert.ok(cycles < 1);
  const k = new TireSpectralSynthesis(44100);
  k.update(input({ wheelAngularSpeed: 1000, wheelSpeed: 200 }), 4);
  assert.ok(render(k, 44100, 'roadOutput').every(Number.isFinite));
});

test('weak/strong Q changes normalized upper-band energy, while keeping S unchanged', () => {
  for (const rate of [44100, 48000]) {
    const weak = new TireSpectralSynthesis(rate),
      strong = new TireSpectralSynthesis(rate);
    weak.update(input({ demand: 0.45 }));
    strong.update(input({ demand: 3 }));
    assert.deepEqual(render(weak, rate, 'scrubOutput'), render(strong, rate, 'scrubOutput'));
    const a = bandEnergy(weak, rate),
      b = bandEnergy(strong, rate);
    assert.ok(a[0] > 0 && b[0] > a[0]);
    assert.ok(a[1] / a[0] < (b[1] / b[0]) * 0.15, 'cannot reproduce this by a common volume change');
    assert.ok(a[3] / a[0] < (b[3] / b[0]) * 0.005);
    const weights = SPECTRAL_SETTINGS.harmonicWeights;
    assert.ok(
      Math.abs(b[1] / b[0] - (weights[1] / weights[0]) ** 2) < 0.65,
      'strong accepted harmonic palette retained',
    );
  }
});

test('Q onset/recovery drives the same continuous state with no event branch or phase reset', () => {
  const k = new TireSpectralSynthesis(48000);
  const bands = [...k.bands];
  k.update(input({ demand: 3 }));
  render(k, 48000);
  const full = bandEnergy(k, 24000);
  k.update(input({ demand: 0.45 }));
  render(k, 4800);
  const recovering = bandEnergy(k, 24000);
  assert.ok(recovering[3] / recovering[0] < (full[3] / full[0]) * 0.005);
  assert.ok(recovering[0] > 1e-6, 'upper bands disappear before all output does');
  k.update(input({ demand: 3 }));
  render(k, 4800);
  assert.ok(rms(render(k, 24000)) > 0.04);
  bands.forEach((b, i) => assert.equal(k.bands[i], b));
});
