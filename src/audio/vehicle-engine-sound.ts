import type { CompiledEngineSound } from './engine-sound.js';
import { blowdownSeconds, transverseCutoffHz } from './exhaust-acoustics.js';

/** What an engine sound reads of its vehicle's engine. */
export interface EngineFacts {
  readonly idleRpm: number;
  readonly displacementCc: number;
  readonly compressionRatio: number;
}

/**
 * An engine sound as one vehicle sounds it: the sound and three values that follow from it and the vehicle's engine,
 * computed once where the vehicle catalog resolves the sound. Derived values: DEV controls never change them.
 */
export interface VehicleEngineSound extends CompiledEngineSound {
  /** The output low-pass: the widest outlet's first transverse mode, where the one-dimensional pipes stop holding. */
  readonly outputCutoffHz: number;
  /** DC removal: half the idle firing frequency, so DC goes and the idle's fundamental stays. */
  readonly dcHz: number;
  /** Each cylinder's blowdown time constant: its volume emptying through its valve and primary. */
  readonly pulseDecaySeconds: readonly number[];
}

/** `sound` as the vehicle with the admitted `engine` sounds it. */
export function compileVehicleEngineSound(sound: CompiledEngineSound, engine: EngineFacts): VehicleEngineSound {
  const { firingPhases, cycleRevolutions, exhaust } = sound;
  const cylinders = firingPhases.length;
  const widestOutlet = Math.max(...exhaust.pipes.filter(({ to }) => to === null).map(({ diameter }) => diameter));
  // A cylinder's volume at bottom dead centre: its swept volume times r/(r-1).
  const volume =
    ((engine.displacementCc * 1e-6) / cylinders) * (engine.compressionRatio / (engine.compressionRatio - 1));
  return Object.freeze({
    ...sound,
    outputCutoffHz: transverseCutoffHz(widestOutlet),
    dcHz: ((engine.idleRpm / 60) * (cylinders / cycleRevolutions)) / 2,
    pulseDecaySeconds: Object.freeze(
      exhaust.primaries.map(({ diameter }) => blowdownSeconds(volume, exhaust.valve.diameter, diameter)),
    ),
  });
}
