import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

if (!process.argv[2]) throw new Error('Usage: node tools/exhaust-equivalence.mjs REFERENCE_MODULE');
const { ExhaustWaveguide: Reference } = await import(pathToFileURL(resolve(process.argv[2])).href);
let samples = 0;
let cases = 0;
for (const { sound, profile } of VEHICLE_CATALOG)
  for (const rate of [88200, 96000])
    for (const coupled of [false, true])
      for (const tuning of [
        {},
        { outletReflection: 0 },
        { outletReflection: -0.95, returnCutoffHz: 800, attenuationPerMeter: 0, closedExcitation: 0.08 },
      ]) {
        const before = new Reference(sound, rate, coupled, tuning);
        const after = new ExhaustWaveguide(sound, rate, coupled, tuning);
        const label = `${profile.id}/${rate}/${coupled}/${JSON.stringify(tuning)}`;
        for (const [rpm, load] of [
          [900, 0],
          [3000, 0.25],
          [6000, 1],
          [3000, 0],
          [0, 0],
        ])
          for (let i = 0; i < rate / 5; i++) {
            const expected = before.sample(rpm, load);
            const actual = after.sample(rpm, load);
            assert.ok(Number.isFinite(actual), label);
            assert.equal(actual, expected, `${label}/${rpm}/${load}/${i}`);
            samples++;
          }
        cases++;
      }
console.log(JSON.stringify({ status: 'PASS', cases, samples }));
