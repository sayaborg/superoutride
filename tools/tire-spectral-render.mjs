import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-acoustics.js';
import { TireModalSynthesis } from '../dist/audio/tire-modal-model.js';
import { MODAL_SETTINGS } from '../dist/audio/tire-modal-acoustics.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_SETTINGS } from '../dist/audio/tire-spectral-acoustics.js';
import { TireSynthesis, tireParameters } from '../dist/audio/tire-synthesis.js';
import { TireContactSynthesis } from '../dist/audio/tire-contact-model.js';
import { contactTireParameters } from '../dist/audio/tire-sound-controls.js';
import { CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import {
  SPECTRAL_SCENARIOS,
  TIRE_TRANSITION_SCENARIO,
  spectralScenarioAt,
  spectralReferenceObservation,
} from './tire-spectral-scenarios.mjs';

const directory = resolve(process.argv[2] ?? '/tmp/tire-spectral-audition');
const rate = Number(process.argv[3] ?? 48000);
if (!Number.isInteger(rate) || rate < SPECTRAL_SETTINGS.minRate || rate > SPECTRAL_SETTINGS.maxRate)
  throw new RangeError('rate must be an integer from 44100 to 192000');
await mkdir(directory, { recursive: true });

async function writeWave(name, samples) {
  const wav = Buffer.alloc(44 + samples.length * 2);
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
  wav.writeUInt32LE(samples.length * 2, 40);
  let peak = 0,
    energy = 0;
  const windows = [];
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error(`unclipped output out of range: ${name}`);
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
    const second = Math.floor(i / rate);
    windows[second] = (windows[second] ?? 0) + (value * value) / rate;
    wav.writeInt16LE(Math.round(value * 32767), 44 + 2 * i);
  }
  await writeFile(join(directory, name), wav);
  return { file: name, peak, rms: Math.sqrt(energy / samples.length), secondRms: windows.map(Math.sqrt) };
}

const report = {
  rate,
  observationHz: 60,
  note: 'One asphalt contact; synthetic common trace, not gameplay capture. Fixed gains; no peak/RMS matching.',
  references:
    'CURRENT raw kernel; CONTACT friction-only at its existing 0.5 listening gain. SPECTRAL mix is S+Q; HYBRID mix is R+S+Q, with isolated rolling, sliding and squeal taps. MODAL is Q only; compare modal-friction with hybrid-squeal for timbre and with hybrid-friction (S+Q) for friction coverage. It has no R/S sources.',
  settings: SPECTRAL_SETTINGS,
  hybridSettings: HYBRID_SETTINGS,
  modalSettings: MODAL_SETTINGS,
  scenes: [],
};
for (const scene of [...SPECTRAL_SCENARIOS, TIRE_TRANSITION_SCENARIO]) {
  const spectral = new TireSpectralSynthesis(rate);
  const hybrid = new TireHybridSynthesis(rate);
  const modal = new TireModalSynthesis(rate);
  const current = new TireSynthesis(rate, CONTACT_ACOUSTICS.frontSeed);
  const contact = new TireContactSynthesis(rate, CONTACT_ACOUSTICS.frontSeed);
  const length = Math.round(scene.seconds * rate);
  const outputs = Object.fromEntries(
    [
      'spectral-mix',
      'spectral-scrub',
      'spectral-squeal',
      'current',
      'contact-friction',
      'hybrid-squeal',
      'hybrid-scrub',
      'hybrid-friction',
      'hybrid-road',
      'hybrid-mix',
      'modal-friction',
    ].map((name) => [name, new Float64Array(length)]),
  );
  let frame = -1;
  const started = performance.now();
  for (let i = 0; i < length; i++) {
    const nextFrame = Math.floor((i * 60) / rate);
    if (nextFrame !== frame) {
      frame = nextFrame;
      const value = spectralScenarioAt(scene, frame / 60);
      spectral.update(value);
      const reference = spectralReferenceObservation(value);
      current.update(tireParameters(reference));
      hybrid.update(value);
      modal.update(value, 0);
      const p = contactTireParameters(reference);
      contact.update(p.travelSpeed, p.slipSpeed, p.load, p.surfaceIndex);
    }
    spectral.sample();
    outputs['spectral-mix'][i] = spectral.scrubOutput + spectral.squealOutput;
    outputs['spectral-scrub'][i] = spectral.scrubOutput;
    outputs['spectral-squeal'][i] = spectral.squealOutput;
    outputs.current[i] = current.sample();
    outputs['hybrid-mix'][i] = hybrid.sample();
    outputs['hybrid-squeal'][i] = hybrid.squealOutput;
    outputs['hybrid-scrub'][i] = hybrid.scrubOutput;
    outputs['hybrid-friction'][i] = hybrid.scrubOutput + hybrid.squealOutput;
    outputs['hybrid-road'][i] = hybrid.roadOutput;
    outputs['modal-friction'][i] = modal.sample();
    contact.sample();
    outputs['contact-friction'][i] = contact.frictionOutput * CONTACT_ACOUSTICS.listeningGain;
  }
  const row = {
    id: scene.id,
    seconds: scene.seconds,
    steps: scene.steps,
    combinedRenderMs: performance.now() - started,
    outputs: {},
  };
  for (const [name, samples] of Object.entries(outputs))
    row.outputs[name] = await writeWave(`${scene.id}-${name}.wav`, samples);
  report.scenes.push(row);
}
await writeFile(join(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
