import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledArcadeVehicleProfile } from '../vehicle/physics/vehicle-profiles.js';
import type { TorqueProtectionPolicy } from '../vehicle/physics/torque-protection.js';
import type { ArcadeSteeringCalibrationInput } from '../vehicle/physics/vehicle-calibration.js';
import type { ArcadeTireFrictionCalibrationState } from '../vehicle/physics/tire-friction-calibration.js';

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
  if (typeof authoring.countdown !== 'boolean') throw new TypeError('Session countdown must be boolean');
  return Object.freeze({
    mode: authoring.mode,
    rivalCount: authoring.rivalCount,
    lapCount: authoring.lapCount,
    countdown: authoring.countdown,
  });
}
