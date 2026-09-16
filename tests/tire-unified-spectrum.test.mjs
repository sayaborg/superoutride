import assert from 'node:assert/strict';
import test from 'node:test';
import { TireUnifiedSynthesis } from '../dist/audio/tire-unified-model.js';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { UNIFIED_SETTINGS } from '../dist/audio/tire-unified-acoustics.js';

const observation = (slip, power) => ({
  longitudinalVelocity: 25,
  lateralVelocity: slip,
  wheelSpeed: 25,
  wheelAngularSpeed: 25 / 0.3,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: power,
  demand: 1.5,
});

// Windowed Goertzel periodogram, independent of the production resonator implementation.
// Broad bands and dominance test spectral evolution, not a copied coefficient or exact peak bin.
function spectrum(values, rate) {
  const size = 2048,
    lastBin = Math.floor((4000 * size) / rate);
  const power = new Float64Array(lastBin + 1),
    window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  for (let start = 0; start + size <= values.length; start += size) {
    for (let bin = 1; bin <= lastBin; bin++) {
      const coefficient = 2 * Math.cos((2 * Math.PI * bin) / size);
      let q1 = 0,
        q2 = 0;
      for (let i = 0; i < size; i++) {
        const q = values[start + i] * window[i] + coefficient * q1 - q2;
        q2 = q1;
        q1 = q;
      }
      power[bin] += q1 * q1 + q2 * q2 - coefficient * q1 * q2;
    }
  }
  let low = 0,
    high = 0,
    peak = 1;
  for (let bin = 1; bin <= lastBin; bin++) {
    const hz = (bin * rate) / size;
    if (hz >= 80 && hz < 800) low += power[bin];
    if (hz >= 800 && hz < 2000) high += power[bin];
    if (power[bin] > power[peak]) peak = bin;
  }
  return { ratio: high / low, peakHz: (peak * rate) / size };
}

function measure(value, rate, seed) {
  const unified = new TireUnifiedSynthesis(rate, seed),
    hybrid = new TireHybridSynthesis(rate, seed);
  unified.update(value);
  hybrid.update(value);
  const values = new Float64Array(32768);
  let hybridEnergy = 0;
  for (let i = 0; i < rate + values.length; i++) {
    unified.sample();
    hybrid.sample();
    if (i >= rate) {
      values[i - rate] = unified.frictionOutput;
      hybridEnergy += hybrid.squealOutput ** 2;
    }
  }
  return { ...spectrum(values, rate), hybridRms: Math.sqrt(hybridEnergy / values.length) };
}

test('one Q changes from broad low rubbing through resonance to a high squeal, beyond the former onset', () => {
  for (const rate of [44100, 48000]) {
    for (const seed of [UNIFIED_SETTINGS.frontSeed, UNIFIED_SETTINGS.rearSeed]) {
      const weak = measure(observation(2, 4000), rate, seed),
        approach = measure(observation(4, 12000), rate, seed),
        strong = measure(observation(6, 24000), rate, seed);
      assert.ok(weak.peakHz < 700 && weak.ratio < 0.5, 'early friction is low/broad rather than a quiet high squeal');
      assert.ok(
        approach.ratio > weak.ratio && approach.ratio < 1,
        'the same output develops resonance before dominance',
      );
      assert.ok(
        strong.peakHz > 1000 && strong.peakHz < 1700 && strong.ratio > 1,
        'strong friction sustains high vibration',
      );
      assert.ok(strong.ratio > weak.ratio * 3, 'a uniform volume change cannot satisfy the timbre transition');
      assert.ok(approach.hybridRms > strong.hybridRms * 0.7, 'this approach case already squeals strongly in HYBRID');
    }
  }
});
