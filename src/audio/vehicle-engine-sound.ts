import type { CompiledEngineSound } from './engine-sound.js';

/** What an engine sound reads of its vehicle's engine. */
export interface EngineFacts {
  readonly displacementCc: number;
  readonly compressionRatio: number;
}

/**
 * An engine sound as one vehicle sounds it: the sound and its cylinders as the vehicle's engine has them, taken once
 * where the vehicle catalog resolves the sound.
 */
export interface VehicleEngineSound extends CompiledEngineSound {
  /** One cylinder's swept volume, m³: the displacement over the cylinders. */
  readonly sweptVolume: number;
  /** The geometric compression ratio: the clearance volume is the swept volume over (ratio - 1). */
  readonly compressionRatio: number;
}

/** `sound` as the vehicle with the admitted `engine` sounds it. */
export function compileVehicleEngineSound(sound: CompiledEngineSound, engine: EngineFacts): VehicleEngineSound {
  return Object.freeze({
    ...sound,
    sweptVolume: (engine.displacementCc * 1e-6) / sound.firingPhases.length,
    compressionRatio: engine.compressionRatio,
  });
}
