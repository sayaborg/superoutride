import type { CompiledArcadeVehicleProfile } from '../physics/vehicle-profiles.js';
import type { TorqueProtectionPolicy } from '../physics/torque-protection.js';
import type { ArcadeSteeringCalibrationInput } from '../physics/vehicle-calibration.js';
import type { ArcadeTireFrictionCalibrationState } from '../physics/tire-friction-calibration.js';

export interface SessionVehicle {
  readonly profile: CompiledArcadeVehicleProfile;
  readonly torqueProtection: TorqueProtectionPolicy;
  readonly kind: 'car' | 'bike';
  readonly steeringCalibration: ArcadeSteeringCalibrationInput;
  readonly tireFrictionCalibration: Readonly<ArcadeTireFrictionCalibrationState>;
}

export interface SessionConfiguration {
  readonly mode: 'CLASSIC' | 'CUSTOM';
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  readonly lapCount: number;
  readonly countdown: boolean;
}

const MAX_RIVAL_COUNT = 16;

export function compileSessionConfiguration(authoring: SessionConfiguration): Readonly<SessionConfiguration> {
  if (authoring.mode !== 'CLASSIC' && authoring.mode !== 'CUSTOM')
    throw new RangeError('Session mode must be CLASSIC or CUSTOM');
  if (!Number.isInteger(authoring.rivalCount) || authoring.rivalCount < 0 || authoring.rivalCount > MAX_RIVAL_COUNT)
    throw new RangeError(`session rivalCount must be an integer within 0..${MAX_RIVAL_COUNT}`);
  if (!Number.isInteger(authoring.lapCount) || authoring.lapCount < 1 || authoring.lapCount > 99)
    throw new RangeError('Session lapCount must be an integer within 1..99');
  if (typeof authoring.countdown !== 'boolean') throw new TypeError('Session countdown must be boolean');
  return Object.freeze({
    mode: authoring.mode,
    rivalCount: authoring.rivalCount,
    lapCount: authoring.lapCount,
    countdown: authoring.countdown,
  });
}
