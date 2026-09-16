import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_RESPONSE_SCENARIOS } from './tire-spectral-scenarios.mjs';

// Reproducible R/S/Q audition. Optional earlier build compares the same SI observation trace.
// Fixed gains only; no automatic matching, limiters or recorded runtime assets.
const directory = resolve(process.argv[2] ?? '/tmp/tire-response');
const previous = process.argv[3];
const rate = Number(process.argv[4] ?? 48000);
if (![44100, 48000, 96000].includes(rate)) throw new RangeError('rate must be 44100, 48000 or 96000');
const models = { revised: TireSpectralSynthesis };
if (previous && previous !== '-')
  models.previous = (
    await import(pathToFileURL(resolve(previous, 'audio/tire-spectral-model.js')).href)
  ).TireSpectralSynthesis;
await mkdir(directory, { recursive: true });
const report = {
  rate,
  gain: 1,
  note: 'One synthetic contact, 0.3 m authored radius, fixed gain, not real recorded driving.',
  scenes: [],
};
for (const scene of SPECTRAL_RESPONSE_SCENARIOS) {
  for (const [model, Constructor] of Object.entries(models)) {
    const kernel = new Constructor(rate);
    const taps = Object.fromEntries(['R', 'S', 'Q', 'mix'].map((tap) => [tap, new Float64Array(scene.seconds * rate)]));
    let frame = -1;
    for (let i = 0; i < taps.mix.length; i++) {
      const next = Math.floor((i * 60) / rate);
      if (next !== frame) {
        frame = next;
        kernel.update(scene.observe(frame / 60));
      }
      taps.mix[i] = kernel.sample();
      taps.R[i] = kernel.roadOutput;
      taps.S[i] = kernel.scrubOutput;
      taps.Q[i] = kernel.squealOutput;
    }
    const row = { scene: scene.id, model, seconds: scene.seconds, outputs: {} };
    for (const [tap, data] of Object.entries(taps)) {
      const wav = Buffer.alloc(44 + 2 * data.length);
      wav.write('RIFF');
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(rate, 24);
      wav.writeUInt32LE(rate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(data.length * 2, 40);
      let peak = 0,
        energy = 0;
      for (let i = 0; i < data.length; i++) {
        const x = data[i];
        if (!Number.isFinite(x) || Math.abs(x) >= 1) throw new Error(`${scene.id}/${model}/${tap}: invalid output`);
        peak = Math.max(peak, Math.abs(x));
        energy += x * x;
        wav.writeInt16LE(Math.round(x * 32767), 44 + i * 2);
      }
      const filename = `${scene.id}-${model}-${tap}.wav`;
      await writeFile(join(directory, filename), wav);
      row.outputs[tap] = { filename, peak, rms: Math.sqrt(energy / data.length) };
    }
    report.scenes.push(row);
  }
}
await writeFile(join(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
