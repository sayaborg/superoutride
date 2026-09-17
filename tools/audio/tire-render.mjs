import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TIRE_AUDITION_PHASES, TIRE_AUDITION_SECONDS } from './tire-scenarios.mjs';

// Offline diagnostic output only. Never imported or played by the production game.
if (!process.argv[2]) throw Error('Usage: node tools/audio/tire-render.mjs OUTPUT.wav [REFERENCE_MODULE]');
const source = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3]))
  : new URL('../../dist/audio/tire-synthesis.js', import.meta.url);
const { TireSynthesis, tireParameters } = await import(source.href);
const rate = 48000;
const front = new TireSynthesis(rate, 123456789),
  rear = new TireSynthesis(rate, 362436069);
const state = {};
const length = rate * TIRE_AUDITION_SECONDS;
const wav = Buffer.alloc(44 + length * 2);
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
wav.writeUInt32LE(length * 2, 40);
let peak = 0,
  power = 0;
for (let i = 0; i < length; i++) {
  if (i % rate === 0 && i / rate < TIRE_AUDITION_PHASES.length) {
    Object.assign(state, TIRE_AUDITION_PHASES[i / rate]);
    front.update(tireParameters(state));
    rear.update(tireParameters(state));
  }
  const sample = front.sample() + rear.sample();
  if (!Number.isFinite(sample) || Math.abs(sample) >= 1) throw Error('invalid output');
  peak = Math.max(peak, Math.abs(sample));
  power += sample * sample;
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
await writeFile(process.argv[2], wav);
console.log(
  JSON.stringify({
    source: source.href,
    output: resolve(process.argv[2]),
    seconds: TIRE_AUDITION_SECONDS,
    peak,
    rms: Math.sqrt(power / length),
    note: 'Fixed-gain synthesized preview, no RMS normalization.',
  }),
);
