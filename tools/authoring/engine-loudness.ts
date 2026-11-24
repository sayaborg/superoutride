import type { ControlSettings } from '../../src/audio/audio-control-policy.js';
import { compressed } from '../../src/audio/engine-chain.js';
import { EXHAUST_RENDERINGS, ExhaustRenderer, type ExhaustRendering } from '../../src/audio/exhaust-rate.js';
import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import { ENGINE_LOUDNESS_ID } from '../../src/content/engine-loudness.js';
import { procedureSha256 } from '../course/procedure.js';

/**
 * The engine loudness procedure: one drive at each of the `renderings`, the game's exhaust kernel at each divisor of
 * the 48 kHz output brought up to it and the light kernel at the output's rate, metered by ITU-R BS.1770-4 integrated loudness of the engine's compressed sound, before its
 * gain and soft clip. Each drive segment is its seconds, the engine speed it runs from and to (`idle` and `redline` are
 * the vehicle's, linearly between) and the opening; fuel is never cut. Any code change that changes its results raises
 * its version.
 */
export const ENGINE_LOUDNESS_PROCEDURE = Object.freeze({
  name: 'superoutride.engine-loudness',
  version: 8,
  sampleRate: 48000,
  renderings: EXHAUST_RENDERINGS,
  measured: 'compressed',
  drive: Object.freeze([
    Object.freeze({ seconds: 1, from: 'idle', to: 'idle', opening: 0 }),
    Object.freeze({ seconds: 3, from: 'idle', to: 'redline', opening: 1 }),
    Object.freeze({ seconds: 0.3, from: 'redline', to: 'redline', opening: 1 }),
    Object.freeze({ seconds: 1.7, from: 'redline', to: 2500, opening: 0 }),
    Object.freeze({ seconds: 1.5, from: 3000, to: 3500, opening: 0.3 }),
    Object.freeze({ seconds: 0.5, from: 3500, to: 'idle', opening: 0 }),
  ] as const),
});

/** The engine speed a drive segment names for a vehicle. */
function engineSpeed(speed: number | 'idle' | 'redline', vehicle: CompiledVehicleDefinition): number {
  const { idleRpm, redlineRpm } = vehicle.compiledVehicle.powertrain;
  return speed === 'idle' ? idleRpm : speed === 'redline' ? redlineRpm : speed;
}

/**
 * A vehicle's engine loudness at each of the procedure's renderings: the integrated loudness (LUFS) of its engine's
 * compressed sound on the procedure's drive with the given TIMING settings.
 */
export function measureEngineLoudness(vehicle: CompiledVehicleDefinition, control: ControlSettings): number[] {
  return ENGINE_LOUDNESS_PROCEDURE.renderings.map((rendering) => {
    const { sampleRate } = ENGINE_LOUDNESS_PROCEDURE;
    return integratedLoudness(compressed(driveSound(vehicle, rendering, control), sampleRate));
  });
}

/** The procedure's drive through a vehicle's kernel at `rendering`, at the output's rate. */
function driveSound(
  vehicle: CompiledVehicleDefinition,
  rendering: ExhaustRendering,
  control: ControlSettings,
): Float64Array {
  const { sampleRate, drive } = ENGINE_LOUDNESS_PROCEDURE;
  const kernel = new ExhaustRenderer(vehicle.sound, sampleRate, rendering, control);
  const lengths = drive.map(({ seconds }) => Math.round(seconds * sampleRate));
  const signal = new Float64Array(lengths.reduce((sum, samples) => sum + samples, 0));
  let offset = 0;
  drive.forEach(({ from, to, opening }, segment) => {
    const start = engineSpeed(from, vehicle),
      end = engineSpeed(to, vehicle);
    const samples = lengths[segment]!;
    const rpm = Float64Array.from({ length: samples }, (_, n) => start + ((end - start) * n) / samples);
    kernel.render(signal, offset, samples, rpm, new Float64Array(samples).fill(opening), true);
    offset += samples;
  });
  return signal;
}

/** BS.1770-4's K-weighting at 48 kHz: the head's high shelf, then the revised low-frequency B high-pass. */
const K_WEIGHTING = Object.freeze([
  Object.freeze({
    b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
    a: [-1.69065929318241, 0.73248077421585],
  }),
  Object.freeze({ b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] }),
]);

/**
 * ITU-R BS.1770-4 integrated loudness (LUFS) of a mono signal at 48 kHz: K-weighting, the mean square of 400 ms blocks
 * every 100 ms, blocks above the absolute gate (−70 LUFS), then those above the relative gate (10 LU below their mean).
 */
export function integratedLoudness(signal: Float64Array): number {
  let weighted = signal;
  for (const { b, a } of K_WEIGHTING) {
    const out = new Float64Array(weighted.length);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let n = 0; n < weighted.length; n++) {
      const x = weighted[n]!;
      const y = b[0]! * x + b[1]! * x1 + b[2]! * x2 - a[0]! * y1 - a[1]! * y2;
      [x2, x1, y2, y1] = [x1, x, y1, y];
      out[n] = y;
    }
    weighted = out;
  }
  const { sampleRate } = ENGINE_LOUDNESS_PROCEDURE;
  const block = 0.4 * sampleRate,
    hop = 0.1 * sampleRate;
  const powers: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    let sum = 0;
    for (let n = start; n < start + block; n++) sum += weighted[n]! ** 2;
    powers.push(sum / block);
  }
  const loudness = (power: number) => -0.691 + 10 * Math.log10(power);
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const audible = powers.filter((power) => loudness(power) > -70);
  const relativeGate = loudness(mean(audible)) - 10;
  return loudness(mean(audible.filter((power) => loudness(power) > relativeGate)));
}

/** The saved engine loudness, under `content/`. */
export const ENGINE_LOUDNESS_PATH = `engine-loudness/${ENGINE_LOUDNESS_ID}.json`;

/** The procedure's identity, which a saved engine loudness names. */
export const engineLoudnessProcedureSha256 = (): Promise<string> => procedureSha256(ENGINE_LOUDNESS_PROCEDURE);
