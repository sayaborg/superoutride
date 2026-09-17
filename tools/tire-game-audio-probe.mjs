import { TireUnifiedSynthesis } from '../dist/audio/tire-unified-model.js';
import { UNIFIED_SETTINGS } from '../dist/audio/tire-unified-acoustics.js';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-acoustics.js';
import { TireModalSynthesis } from '../dist/audio/tire-modal-model.js';
import { MODAL_SETTINGS } from '../dist/audio/tire-modal-acoustics.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { createVehicleAudioObservation, readVehicleAudio } from '../dist/browser/vehicle-audio.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { TireSynthesis, tireParameters } from '../dist/audio/tire-synthesis.js';
import { TireContactSynthesis } from '../dist/audio/tire-contact-model.js';
import { CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_SETTINGS } from '../dist/audio/tire-spectral-acoustics.js';
import { contactTireParameters, tireSoundParameters, TIRE_SOUND_MODELS } from '../dist/audio/tire-sound-controls.js';

// One real, completed mechanics trace is replayed through each adapter. No output matching or altered physics.
const rate = Number(process.argv[2] ?? 48000);
if (![44100, 48000, 96000].includes(rate)) throw new RangeError('probe rate: 44100, 48000 or 96000');
const runtime = createLinearHighwayRuntime();
const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
const player = createArcadeVehicle(VEHICLE_CATALOG[0].profile, world, { s: 45, initialSpeed: 35 });
const observation = createVehicleAudioObservation();
readVehicleAudio(player, observation);
const trace = [];
for (let tick = 0; tick < 600; tick++) {
  updateArcadeVehicle(
    world,
    player,
    { steering: tick < 120 ? 0 : 0.5 * Math.sin((tick - 120) / 100), throttle: tick < 400, brake: tick >= 400 },
    1 / 120,
  );
  if (tick % 2 === 1) {
    readVehicleAudio(player, observation);
    trace.push(structuredClone(observation));
  }
}
const observed = trace.map((v) => [tireSoundParameters(v.front), tireSoundParameters(v.rear)]);
const controls = {
  current: trace.map((v) => [tireParameters(v.front), tireParameters(v.rear)]),
  contact: trace.map((v) => [contactTireParameters(v.front), contactTireParameters(v.rear)]),
  hybrid: observed,
  spectral: observed,
  modal: observed,
  unified: observed,
};
const factories = {
  unified: () => [
    new TireUnifiedSynthesis(rate, UNIFIED_SETTINGS.frontSeed),
    new TireUnifiedSynthesis(rate, UNIFIED_SETTINGS.rearSeed),
  ],
  current: () => [
    new TireSynthesis(rate, CONTACT_ACOUSTICS.frontSeed),
    new TireSynthesis(rate, CONTACT_ACOUSTICS.rearSeed),
  ],
  contact: () => [
    new TireContactSynthesis(rate, CONTACT_ACOUSTICS.frontSeed),
    new TireContactSynthesis(rate, CONTACT_ACOUSTICS.rearSeed),
  ],
  hybrid: () => [
    new TireHybridSynthesis(rate, HYBRID_SETTINGS.frontSeed),
    new TireHybridSynthesis(rate, HYBRID_SETTINGS.rearSeed),
  ],
  spectral: () => [new TireSpectralSynthesis(rate), new TireSpectralSynthesis(rate, SPECTRAL_SETTINGS.rearSeed)],
  modal: () => [
    new TireModalSynthesis(rate, MODAL_SETTINGS.frontSeed),
    new TireModalSynthesis(rate, MODAL_SETTINGS.rearSeed),
  ],
};
function render(model) {
  const pair = factories[model]();
  const gain = model === 'contact' ? CONTACT_ACOUSTICS.listeningGain : 1;
  let frame = -1,
    peak = 0,
    energy = 0;
  const started = performance.now();
  for (let i = 0; i < rate * 5; i++) {
    const next = Math.floor((i * 60) / rate);
    if (next !== frame) {
      frame = next;
      for (let axle = 0; axle < 2; axle++) {
        const v = controls[model][frame][axle],
          kernel = pair[axle];
        if (model === 'contact') kernel.update(v.travelSpeed, v.slipSpeed, v.load, v.surfaceIndex);
        else if (model === 'current') kernel.update(v);
        else kernel.update(v, v.surfaceIndex);
      }
    }
    const value = (pair[0].sample() + pair[1].sample()) * gain;
    if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error(`unclipped output out of range: ${model}`);
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
  }
  return { elapsedMs: performance.now() - started, peak, rms: Math.sqrt(energy / (rate * 5)) };
}
for (const model of TIRE_SOUND_MODELS) render(model);
const rows = Object.fromEntries(TIRE_SOUND_MODELS.map((model) => [model, []]));
for (let run = 0; run < 5; run++)
  for (const model of run % 2 ? [...TIRE_SOUND_MODELS].reverse() : TIRE_SOUND_MODELS) rows[model].push(render(model));
const result = Object.fromEntries(
  Object.entries(rows).map(([model, runs]) => {
    const medianMs = runs.map((r) => r.elapsedMs).sort((a, b) => a - b)[2];
    return [
      model,
      {
        medianMs,
        fractionOfRealtime: medianMs / 5000,
        peak: runs[0].peak,
        rms: runs[0].rms,
        runsMs: runs.map((r) => r.elapsedMs),
      },
    ];
  }),
);
console.log(
  JSON.stringify(
    {
      rate,
      seconds: 5,
      traceFrames: trace.length,
      profile: VEHICLE_CATALOG[0].profile.id,
      note: 'Warmed alternating host replay, two axles, fixed gains. Includes updates and peak/RMS bookkeeping; excludes observation capture, browser graph, engines and rendering. Not a phone budget or timbre acceptance.',
      result,
    },
    null,
    2,
  ),
);
