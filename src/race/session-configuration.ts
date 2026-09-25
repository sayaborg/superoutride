import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';

/** The vehicle and driving definitions a Session drives; everything else derives from them. */
export interface SessionVehicle {
  readonly vehicleDefinition: CompiledVehicleDefinition;
  readonly drivingDefinition: CompiledDrivingDefinition;
  readonly surfaceMaterials: SurfaceMaterialCatalog;
}

export interface SessionConfiguration {
  readonly mode: 'CLASSIC' | 'CUSTOM';
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  readonly lapCount: number;
  readonly timeLimit: boolean;
}

export function compileSessionConfiguration(authoring: SessionConfiguration): Readonly<SessionConfiguration> {
  if (authoring.mode !== 'CLASSIC' && authoring.mode !== 'CUSTOM')
    throw new RangeError('Session mode must be CLASSIC or CUSTOM');
  if (
    !Number.isInteger(authoring.rivalCount) ||
    authoring.rivalCount < 0 ||
    authoring.rivalCount > SESSION_RULE_LIMITS.rivals
  )
    throw new RangeError(`session rivalCount must be an integer within 0..${SESSION_RULE_LIMITS.rivals}`);
  if (!Number.isInteger(authoring.lapCount) || authoring.lapCount < 1 || authoring.lapCount > SESSION_RULE_LIMITS.laps)
    throw new RangeError(`Session lapCount must be an integer within 1..${SESSION_RULE_LIMITS.laps}`);
  if (typeof authoring.timeLimit !== 'boolean') throw new TypeError('Session timeLimit must be boolean');
  return Object.freeze({
    mode: authoring.mode,
    rivalCount: authoring.rivalCount,
    lapCount: authoring.lapCount,
    timeLimit: authoring.timeLimit,
  });
}
