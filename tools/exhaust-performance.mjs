import { performance } from 'node:perf_hooks';
import { TireSynthesis, tireParameters } from '../dist/audio/tire-synthesis.js';
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
      note: 'Warmed host DSP timings, not browser or phone CPU certification; 2x acoustic stepping included.',
      rows,
      tires: { axles: 2, millisecondsPerAudioSecond: tireTimings[2], peak: tirePeak },
    },
    null,
    2,
  ),
);
