import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { TireSynthesis, tireParameters } from '../dist/audio/tire-synthesis.js';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

const Reference = process.argv[2]
  ? (await import(pathToFileURL(resolve(process.argv[2])).href)).ExhaustWaveguide
  : null;
const rows = [];
for (const { profile, sound } of VEHICLE_CATALOG.filter((entry) => entry.sound.exhaust)) {
  for (const voices of [1, 2]) {
    const rate = 48000;
    const variants = [ExhaustWaveguide, ...(Reference ? [Reference] : [])].map((Kernel) => ({
      engines: Array.from({ length: voices }, () => new Kernel(sound, rate)),
      timings: [],
      peak: 0,
    }));
    for (let run = 0; run < 8; run++) {
      // Alternate order; initial passes warm both implementations before collecting five pairs.
      for (const variant of run % 2 ? [...variants].reverse() : variants) {
        const start = performance.now();
        for (let i = 0; i < rate; i++)
          for (const engine of variant.engines) variant.peak = Math.max(variant.peak, Math.abs(engine.sample(3000, 1)));
        if (run >= 3) variant.timings.push(performance.now() - start);
      }
    }
    for (const variant of variants) variant.timings.sort((a, b) => a - b);
    rows.push({
      vehicle: profile.id,
      voices,
      millisecondsPerAudioSecond: variants[0].timings[2],
      peak: variants[0].peak,
      ...(Reference
        ? { referenceMilliseconds: variants[1].timings[2], ratio: variants[0].timings[2] / variants[1].timings[2] }
        : {}),
    });
  }
}
const tires = [new TireSynthesis(48000, 123456789), new TireSynthesis(48000, 362436069)];
const tireState = {
  load: 4000,
  rollingSpeed: 25,
  slipSpeed: 10,
  longitudinalPower: 20000,
  lateralPower: 20000,
  utilization: 1.2,
  surface: 'ASPHALT',
};
for (const tire of tires) tire.update(tireParameters(tireState));
const tireTimings = [];
let tirePeak = 0;
for (let run = 0; run < 6; run++) {
  const start = performance.now();
  for (let i = 0; i < 48000; i++) tirePeak = Math.max(tirePeak, Math.abs(tires[0].sample() + tires[1].sample()));
  if (run > 0) tireTimings.push(performance.now() - start);
}
tireTimings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      note: 'Warmed host DSP timings, not browser or phone CPU certification. Native-rate acoustic stepping; optional reference uses alternating paired runs with the same input, without asserting waveform equivalence.',
      rows,
      tires: { axles: 2, millisecondsPerAudioSecond: tireTimings[2], peak: tirePeak },
    },
    null,
    2,
  ),
);
