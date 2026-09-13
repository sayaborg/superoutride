import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

// Fixed single-parameter regression inputs, independent of control defaults.
const TUNING_CASES = [
  {},
  { outletReflection: -0.35 },
  { outletReflection: -0.9 },
  { returnCutoffHz: 1800 },
  { attenuationPerMeter: 0.16 },
  { closedExcitation: 0.08 },
];

test('shared acoustic tuning preserves vehicle authoring and finite output across sample rates', () => {
  for (const { sound } of VEHICLE_CATALOG) {
    const before = structuredClone(sound);
    for (const tuning of TUNING_CASES) {
      for (const rate of [44100, 48000, 88200, 96000]) {
        const synth = new ExhaustWaveguide(sound, rate, tuning);
        for (let i = 0; i < rate / 2; i++) {
          const output = synth.sample(i < rate / 4 ? 1000 : 10000, i < rate / 4 ? 0 : 1);
          assert.ok(Number.isFinite(output) && Math.abs(output) < 0.65);
        }
      }
    }
    assert.deepEqual(sound, before);
  }
});

test('empty tuning is identical and each acoustic control changes the waveguide waveform', () => {
  const sound = VEHICLE_CATALOG[3].sound;
  const baseline = new ExhaustWaveguide(sound, 96000);
  const engines = TUNING_CASES.map((tuning) => new ExhaustWaveguide(sound, 96000, tuning));
  const differences = engines.map(() => 0);
  for (let i = 0; i < 96000; i++) {
    const reference = baseline.sample(3000, 0.25);
    engines.forEach((engine, j) => {
      differences[j] += (engine.sample(3000, 0.25) - reference) ** 2;
    });
  }
  assert.equal(differences[0], 0);
  assert.ok(differences.slice(1).every((x) => x > 0.01));
});

test('acoustic tuning rejects unstable or nonfinite values and cannot override other constants', () => {
  const sound = VEHICLE_CATALOG[0].sound;
  for (const tuning of [
    ...['pulseRiseMs', 'pulseDecayMs'].flatMap((key) => [NaN, Infinity, 0, -1, 31].map((value) => ({ [key]: value }))),
    { pulseRiseMs: 2.01 },
    { pulseVariation: NaN },
    { pulseVariation: Infinity },
    { pulseVariation: -0.01 },
    { pulseVariation: 0.41 },
    { outletReflection: -1.01 },
    { outletReflection: 0.1 },
    { outletReflection: NaN },
    { attenuationPerMeter: -1 },
    { attenuationPerMeter: Infinity },
    { returnCutoffHz: 0 },
    { returnCutoffHz: Infinity },
    { closedExcitation: 0 },
    { closedExcitation: 2 },
    { outputCutoffHz: 0 },
    { outputCutoffHz: -1 },
    { outputCutoffHz: 12001 },
    { outputCutoffHz: NaN },
    { outputCutoffHz: Infinity },
  ])
    assert.throws(() => new ExhaustWaveguide(sound, 96000, tuning), RangeError);
  const normal = new ExhaustWaveguide(sound, 96000);
  const extra = new ExhaustWaveguide(sound, 96000, { waveSpeed: NaN, sourceClosedReflection: 2 });
  for (let i = 0; i < 9600; i++) assert.equal(normal.sample(3000, 1), extra.sample(3000, 1));
});
