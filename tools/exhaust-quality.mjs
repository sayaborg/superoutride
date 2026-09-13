import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

/** Coherent FFT: no window leakage, and no runtime dependency on this diagnostic. */
export function harmonicResidual(values, cycles, rate) {
  const n = values.length;
  const re = Float64Array.from(values),
    im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let ar = 1,
        ai = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k,
          b = a + size / 2;
        const br = re[b] * ar - im[b] * ai,
          bi = re[b] * ai + im[b] * ar;
        re[b] = re[a] - br;
        im[b] = im[a] - bi;
        re[a] += br;
        im[a] += bi;
        const next = ar * wr - ai * wi;
        ai = ar * wi + ai * wr;
        ar = next;
      }
    }
  }
  let signal = 0,
    residual = 0;
  for (let i = 1; i < Math.min(n / 2, Math.floor((20000 * n) / rate)); i++) {
    const power = re[i] ** 2 + im[i] ** 2;
    signal += power;
    if (i % cycles !== 0) residual += power;
  }
  return { db: 10 * Math.log10(Math.max(1e-30, residual / signal)), rms: Math.sqrt(2 * signal) / n };
}

/** Fix controls at equilibrium; an odd cycle count makes event positions visit every sample fraction. */
export function measureExhaust(Kernel, sound, rate, targetRpm, load, tuning = {}) {
  const n = 32768;
  const cycles = Math.max(3, Math.round((targetRpm * n) / (60 * sound.cycleRevolutions * rate)) | 1);
  const rpm = (cycles * 60 * sound.cycleRevolutions * rate) / n;
  const engine = new Kernel(sound, rate, { ...tuning, pulseVariation: 0 });
  engine.rpm = rpm;
  engine.load = load;
  for (let i = 0; i < n * 3; i++) engine.sample(rpm, load);
  const source = new Float64Array(n),
    beforeClip = new Float64Array(n),
    output = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dc = engine.dc;
    output[i] = engine.sample(rpm, load);
    source[i] = (engine.emission ?? engine.rise)[0];
    // Invert the DC-state update; observe the clip input without a production debug API.
    beforeClip[i] = ((engine.dc - dc) * (1 - engine.dcCoefficient)) / engine.dcCoefficient;
  }
  return {
    rpm,
    source: harmonicResidual(source, cycles, rate),
    beforeClip: harmonicResidual(beforeClip, cycles, rate),
    output: harmonicResidual(output, cycles, rate),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const Kernel = process.argv[2]
    ? (await import(pathToFileURL(resolve(process.argv[2])).href)).ExhaustWaveguide
    : ExhaustWaveguide;
  const rows = [];
  for (const { profile, sound } of VEHICLE_CATALOG)
    for (const rate of [44100, 48000])
      for (const load of [0, 1])
        for (const sharp of [false, true]) {
          rows.push({
            vehicle: profile.id,
            rate,
            load,
            sharp,
            ...measureExhaust(
              Kernel,
              sound,
              rate,
              profile.powertrain.redlineRpm,
              load,
              sharp ? { pulseRiseMs: 0.01, pulseDecayMs: 0.1 } : {},
            ),
          });
        }
  console.log(
    JSON.stringify(
      {
        note: 'Steady zero-variation, coherent non-harmonic energy below 20 kHz. This detects inharmonic aliases, not aliases coincident with true harmonics, perceptual quality, or changing-load behavior.',
        rows,
      },
      null,
      2,
    ),
  );
}
