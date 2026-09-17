import assert from 'node:assert/strict';
import test from 'node:test';
import { TireModalSynthesis } from '../../dist/audio/tire-modal-model.js';
import { TireHybridSynthesis } from '../../dist/audio/tire-hybrid-model.js';
import { MODAL_SETTINGS } from '../../dist/audio/tire-modal-acoustics.js';

// Windowed periodogram measures emitted sound, independently of oscillator internals.
function spectrum(kernel, rate, slip, power) {
  kernel.update({
    longitudinalVelocity: 25,
    lateralVelocity: slip,
    wheelSpeed: 25,
    wheelAngularSpeed: 25 / 0.3,
    load: 4000,
    longitudinalPower: 0,
    lateralPower: power,
    demand: 1.5,
  });
  for (let i = 0; i < rate; i++) kernel.sample();
  const size = 4096,
    count = 8;
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const bins = new Float64Array(Math.floor((7000 * size) / rate));
  for (let block = 0; block < count; block++) {
    const values = Float64Array.from(window, (w) => {
      kernel.sample();
      return w * (kernel.frictionOutput ?? kernel.squealOutput);
    });
    for (let bin = 1; bin < bins.length; bin++) {
      const coefficient = 2 * Math.cos((2 * Math.PI * bin) / size);
      let q1 = 0,
        q2 = 0;
      for (const value of values) {
        const q = value + coefficient * q1 - q2;
        q2 = q1;
        q1 = q;
      }
      bins[bin] += q1 ** 2 + q2 ** 2 - coefficient * q1 * q2;
    }
  }
  return (center, radius) => {
    let energy = 0,
      moment = 0,
      peak = 0,
      peakBin = 0;
    for (let bin = 1; bin < bins.length; bin++) {
      const hz = (bin * rate) / size;
      if (Math.abs(hz - center) <= radius) {
        energy += bins[bin];
        moment += hz * bins[bin];
        if (bins[bin] > peak) {
          peak = bins[bin];
          peakBin = bin;
        }
      }
    }
    return { energy, centroidHz: moment / energy, peakHz: (peakBin * rate) / size };
  };
}

test('the same Q bands concentrate spectrally as feedback rises, without a second source', () => {
  for (const rate of [44100, 48000])
    for (const seed of [MODAL_SETTINGS.frontSeed, MODAL_SETTINGS.rearSeed]) {
      const center = 2 * (1100 + (350 * 10) / 16);
      const measure = (power) => {
        const bins = spectrum(new TireModalSynthesis(rate, seed, { wanderDepth: 0 }), rate, 10, power);
        return bins(center, 35).energy / bins(center, 400).energy;
      };
      const weak = measure(300),
        strong = measure(60000);
      assert.ok(strong > weak * 1.4, `narrow-band concentration must change, not just gain: ${weak}, ${strong}`);
      assert.ok(strong < 1 && strong > 0.7, 'strong Q retains stochastic side energy');
    }
});

test('four emitted harmonic regions retain the HYBRID pitch movement as a listening reference', () => {
  for (const rate of [44100, 48000]) {
    let previousPeak = 0;
    for (const slip of [3, 20]) {
      const modal = spectrum(
        new TireModalSynthesis(rate, MODAL_SETTINGS.frontSeed, { wanderDepth: 0 }),
        rate,
        slip,
        60000,
      );
      const hybrid = spectrum(new TireHybridSynthesis(rate), rate, slip, 60000);
      const center = 1100 + (350 * slip) / (slip + 6);
      const energies = [];
      for (let harmonic = 1; harmonic <= 4; harmonic++) {
        const m = modal(harmonic * center, 300),
          h = hybrid(harmonic * center, 300);
        assert.ok(Math.abs(m.peakHz - harmonic * center) < 40, 'emitted MODAL pitch follows the retained control');
        // A noisy band's largest bin wanders; its integrated center measures pitch more reliably.
        assert.ok(Math.abs(m.centroidHz - h.centroidHz) < 60, 'HYBRID and MODAL retain matching band centers');
        energies.push(m.energy);
      }
      assert.ok(Math.min(...energies) > Math.max(...energies) * 0.025, 'all four bands contribute');
      const peak = modal(2 * center, 300).peakHz;
      if (previousPeak)
        assert.ok(peak - previousPeak > 200, 'slip changes audible pitch rather than only an internal control');
      previousPeak = peak;
    }
  }
});
