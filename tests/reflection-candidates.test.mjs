import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { REFLECTION_CANDIDATES } from '../tools/reflection-candidates.mjs';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

test('candidate table changes one coefficient and leaves all vehicle authoring untouched', () => {
  for (const [i, candidate] of REFLECTION_CANDIDATES.entries()) {
    assert.equal(Object.keys(candidate.tuning).length, i === 0 ? 0 : 1);
  }
  for (const { sound } of VEHICLE_CATALOG) {
    const before = structuredClone(sound);
    for (const { tuning } of REFLECTION_CANDIDATES) {
      for (const rate of [88200, 96000]) {
        const synth = new ExhaustWaveguide(sound, rate, false, tuning);
        for (let i = 0; i < rate / 2; i++) {
          const output = synth.sample(i < rate / 4 ? 1000 : 10000, i < rate / 4 ? 0 : 1);
          assert.ok(Number.isFinite(output) && Math.abs(output) < 0.65);
        }
      }
    }
    assert.deepEqual(sound, before);
  }
});

test('empty tuning is identical and each candidate changes the simple-reflection waveform', () => {
  const sound = VEHICLE_CATALOG[3].sound;
  const baseline = new ExhaustWaveguide(sound, 96000, false);
  const engines = REFLECTION_CANDIDATES.map(({ tuning }) => new ExhaustWaveguide(sound, 96000, false, tuning));
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
    { outletReflection: -1 },
    { outletReflection: 0.1 },
    { outletReflection: NaN },
    { attenuationPerMeter: -1 },
    { attenuationPerMeter: Infinity },
    { returnCutoffHz: 0 },
    { returnCutoffHz: Infinity },
    { closedExcitation: 0 },
    { closedExcitation: 2 },
  ])
    assert.throws(() => new ExhaustWaveguide(sound, 96000, false, tuning), RangeError);
  const normal = new ExhaustWaveguide(sound, 96000, false);
  const extra = new ExhaustWaveguide(sound, 96000, false, { waveSpeed: NaN, sourceClosedReflection: 2 });
  for (let i = 0; i < 9600; i++) assert.equal(normal.sample(3000, 1), extra.sample(3000, 1));
});
