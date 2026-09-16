import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_SETTINGS, SPECTRAL_TEXTURES } from '../dist/audio/tire-spectral-acoustics.js';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-acoustics.js';
import { TIRE_SOUND_SURFACES } from '../dist/audio/tire-sound-observation.js';
import {
  SPECTRAL_SCENARIOS,
  SPECTRAL_RESPONSE_SCENARIOS,
  TIRE_TRANSITION_SCENARIO,
  spectralScenarioAt,
} from './tire-spectral-scenarios.mjs';

// Same-model refactor check, NOT an acceptance test for an intentional tune or a different method.
// The reference build must have the current eight-input, R/S/Q kernel and surface contract.
const reference = process.argv[2];
const model = process.argv[3] ?? 'spectral';
if (!reference || !['spectral', 'hybrid'].includes(model))
  throw new Error('usage: node tools/tire-spectral-equivalence.mjs REFERENCE_BUILD [spectral|hybrid]');
const load = (file) => import(pathToFileURL(resolve(reference, 'audio', file)).href);
const Current = model === 'spectral' ? TireSpectralSynthesis : TireHybridSynthesis;
const Reference = (await load(`tire-${model}-model.js`))[
  model === 'spectral' ? 'TireSpectralSynthesis' : 'TireHybridSynthesis'
];
const referenceSurfaces =
  model === 'spectral'
    ? (await load('tire-spectral-acoustics.js')).SPECTRAL_TEXTURES.map((texture) => texture.surface)
    : (await load('tire-sound-observation.js')).TIRE_SOUND_SURFACES;
assert.deepEqual(
  referenceSurfaces,
  model === 'spectral' ? SPECTRAL_TEXTURES.map((texture) => texture.surface) : TIRE_SOUND_SURFACES,
  'surface identities differ; this probe must not translate incompatible contracts',
);
const seeds =
  model === 'spectral'
    ? [SPECTRAL_SETTINGS.seed, SPECTRAL_SETTINGS.rearSeed]
    : [HYBRID_SETTINGS.frontSeed, HYBRID_SETTINGS.rearSeed];
const scenes = [
  ...[...SPECTRAL_SCENARIOS, TIRE_TRANSITION_SCENARIO].map((scene) => ({
    ...scene,
    observe: (t) => spectralScenarioAt(scene, t),
  })),
  ...SPECTRAL_RESPONSE_SCENARIOS,
  {
    id: 'surface-reverse-support',
    seconds: 4,
    observe(t) {
      return {
        longitudinalVelocity: t < 2 ? 30 : -30,
        lateralVelocity: t < 2 ? 4 : -4,
        wheelSpeed: t < 2 ? 35 : -35,
        wheelAngularSpeed: t < 2 ? 100 : -100,
        load: t >= 3 && t < 3.4 ? 0 : 4000,
        longitudinalPower: 5000,
        lateralPower: 12000,
        demand: 1.5,
      };
    },
    surface: (t) => Math.min(4, Math.floor(t / 0.6)),
  },
];
const rows = [];
let scalarComparisons = 0;
for (const rate of [44100, 48000]) {
  for (const seed of seeds) {
    for (const scene of scenes) {
      const before = new Reference(rate, seed),
        after = new Current(rate, seed);
      const count = Math.round(scene.seconds * rate);
      let frame = -1;
      for (let i = 0; i < count; i++) {
        const next = Math.floor((i * 60) / rate);
        if (frame !== next) {
          frame = next;
          const time = frame / 60,
            value = Object.freeze(scene.observe(time)),
            surface = scene.surface?.(time) ?? 0;
          before.update(value, surface);
          after.update(value, surface);
        }
        const expected = before.sample(),
          actual = after.sample();
        const equal = (a, b, tap) => {
          if (!Number.isFinite(a) || !Number.isFinite(b) || !Object.is(a, b))
            throw new Error(`${rate}/${seed}/${scene.id}/${tap} at sample ${i}: ${a} != ${b}`);
        };
        equal(expected, actual, 'mix');
        equal(before.roadOutput, after.roadOutput, 'R');
        equal(before.scrubOutput, after.scrubOutput, 'S');
        equal(before.squealOutput, after.squealOutput, 'Q');
      }
      scalarComparisons += 4 * count;
      rows.push({ rate, seed, scene: scene.id, samplesPerTap: count });
    }
  }
}
console.log(JSON.stringify({ reference: resolve(reference), model, exact: true, scalarComparisons, rows }, null, 2));
