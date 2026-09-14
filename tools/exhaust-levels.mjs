import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Fixed-gain kernel levels, not perceived loudness or the master/compressor output.
// Usage: node tools/exhaust-levels.mjs [build-directory] > /absolute/levels.json
const build = resolve(process.argv[2] ?? 'dist');
const { ExhaustWaveguide } = await import(pathToFileURL(resolve(build, 'audio/exhaust-waveguide.js')).href);
const { VEHICLE_CATALOG } = await import(pathToFileURL(resolve(build, 'vehicle/vehicle-catalog.js')).href);
const { DEFAULT_EXHAUST_TUNING } = await import(pathToFileURL(resolve(build, 'audio/exhaust-acoustics.js')).href);
const db = (amplitude) => (amplitude > 0 ? 20 * Math.log10(amplitude) : null);
const rows = [];
for (const rate of [44100, 48000]) {
  for (const { profile, sound } of VEHICLE_CATALOG) {
    for (const rpm of [4000, 6500]) {
      if (rpm < profile.powertrain.idleRpm || rpm > profile.powertrain.redlineRpm) continue;
      for (const load of [0, 0.5, 1]) {
        const engine = new ExhaustWaveguide(sound, rate);
        for (let i = 0; i < rate; i++) engine.sample(rpm, load);
        let squares = 0,
          peak = 0;
        for (let i = 0; i < rate; i++) {
          const value = engine.sample(rpm, load);
          if (!Number.isFinite(value)) throw new Error(`nonfinite ${profile.id} at ${rate}/${rpm}/${load}`);
          squares += value * value;
          peak = Math.max(peak, Math.abs(value));
        }
        rows.push({ vehicle: profile.id, rate, rpm, load, rmsDbfs: db(Math.sqrt(squares / rate)), peakDbfs: db(peak) });
      }
    }
  }
}
console.log(
  JSON.stringify(
    {
      stage: 'kernel output before voice/master gain and compressor; null dBFS means silence',
      settleSeconds: 1,
      measureSeconds: 1,
      seed: 'kernel reset default, independently reset for each row',
      tuning: DEFAULT_EXHAUST_TUNING,
      rows,
    },
    null,
    2,
  ),
);
