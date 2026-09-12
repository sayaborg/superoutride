import { performance } from 'node:perf_hooks';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
const rate = 96000;
const rows = [];
for (const { profile, sound } of VEHICLE_CATALOG.filter((entry) => entry.sound.exhaust)) {
  for (const voices of [1, 2]) {
    const engines = Array.from({ length: voices }, () => new ExhaustWaveguide(sound, rate));
    let peak = 0;
    for (let i = 0; i < rate; i++) for (const engine of engines) engine.sample(3000, 1);
    const timings = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      for (let i = 0; i < rate; i++)
        for (const engine of engines) peak = Math.max(peak, Math.abs(engine.sample(3000, 1)));
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    rows.push({ vehicle: profile.id, voices, millisecondsPerAudioSecond: timings[2], peak });
  }
}
console.log(
  JSON.stringify(
    { note: 'Warmed host DSP timings, not browser or phone CPU certification; 2x acoustic stepping included.', rows },
    null,
    2,
  ),
);
