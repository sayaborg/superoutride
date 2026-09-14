import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { TireContactTrial } from '../dist/dev/diagnostics/tire-contact-model.js';
import { CONTACT_TRIAL } from '../dist/dev/diagnostics/tire-contact-settings.js';
import { CONTACT_SCENARIOS } from './tire-contact-scenarios.mjs';

// Fixed gain and separate taps. No peak/RMS normalization; out-of-range output is a failure.
const directory = resolve(process.argv[2] ?? '/tmp/tire-contact-audition');
const rate = Number(process.argv[3] ?? 48000);
await mkdir(directory, { recursive: true });
const report = {
  rate,
  listeningGain: CONTACT_TRIAL.listeningGain,
  note: 'Experimental local-contact controls, no game telemetry conversion or listening acceptance.',
  scenes: [],
};
for (const scene of CONTACT_SCENARIOS) {
  const front = new TireContactTrial(rate, CONTACT_TRIAL.frontSeed, scene.texture);
  const rear = new TireContactTrial(rate, CONTACT_TRIAL.rearSeed, scene.texture);
  const length = Math.round(scene.seconds * rate);
  const channels = Array.from({ length: 4 }, () => new Float64Array(length));
  let step = 0;
  const started = performance.now();
  for (let i = 0; i < length; i++) {
    if (step < scene.steps.length && i >= Math.round(scene.steps[step][0] * rate)) {
      front.update(...scene.steps[step][1]);
      rear.update(...scene.steps[step][2]);
      step++;
    }
    front.sample();
    rear.sample();
    channels[0][i] = front.roadOutput;
    channels[1][i] = front.frictionOutput;
    channels[2][i] = rear.roadOutput;
    channels[3][i] = rear.frictionOutput;
  }
  const elapsedMs = performance.now() - started;
  const mixes = { mix: [0, 1, 2, 3], road: [0, 2], friction: [1, 3], front: [0, 1], rear: [2, 3] };
  const row = {
    id: scene.id,
    seconds: scene.seconds,
    steps: scene.steps,
    elapsedMs,
    maxIterations: Math.max(front.maxIterations, rear.maxIterations),
    outputs: {},
  };
  for (const [name, indices] of Object.entries(mixes)) {
    const wav = Buffer.alloc(44 + 2 * length);
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
      sum2 = 0;
    const windows = [];
    for (let i = 0; i < length; i++) {
      const value = indices.reduce((sum, c) => sum + channels[c][i], 0) * CONTACT_TRIAL.listeningGain;
      if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error(`invalid unclipped output: ${scene.id}`);
      peak = Math.max(peak, Math.abs(value));
      sum2 += value * value;
      const second = Math.floor(i / rate);
      windows[second] = (windows[second] ?? 0) + (value * value) / rate;
      wav.writeInt16LE(Math.round(value * 32767), 44 + 2 * i);
    }
    const filename = `${scene.id}-${name}.wav`;
    await writeFile(join(directory, filename), wav);
    row.outputs[name] = { filename, peak, rms: Math.sqrt(sum2 / length), secondRms: windows.map(Math.sqrt) };
  }
  report.scenes.push(row);
}
await writeFile(join(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
