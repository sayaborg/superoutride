import {
  validateSymmetricSteeringActuatorRateProfile,
  type NormalizedActuatorRateProfile,
} from './driving-actuator.js';
import type { CompiledArcadeVehicleProfile } from './vehicle-profiles.js';

export const VEHICLE_PHYSICS_CALIBRATION_STATUS = 'DEV_UNCALIBRATED' as const;

/**
 * This is intentionally not a versioned handling target.
 *
 * Current car/bike equations and parameter values exist to exercise world-space driving,
 * SurfaceMap interaction, camera and gameplay integration. They are not a tuned product
 * handling specification and may change substantially later.
 */
export type VehiclePhysicsCalibrationStatus = typeof VEHICLE_PHYSICS_CALIBRATION_STATUS;

/** The only selectable steering geometry/response values in M9.11. Angles are road-wheel radians. */
export interface ArcadeSteeringCalibrationInput {
  readonly maxRoadWheelSteer?: number;
  readonly steeringOffsetMax?: number;
  readonly steeringActuatorResponse?: NormalizedActuatorRateProfile;
}

export interface ArcadeSteeringCalibrationState {
  maxRoadWheelSteer: number;
  steeringOffsetMax: number;
  steeringActuatorResponse: Readonly<NormalizedActuatorRateProfile>;
}

export interface ArcadeSteeringCalibrationOwner {
  readonly steeringCalibration: ArcadeSteeringCalibrationState;
}

export function createArcadeSteeringCalibration(
  profile: CompiledArcadeVehicleProfile,
  input: ArcadeSteeringCalibrationInput = {},
): ArcadeSteeringCalibrationState {
  const maxRoadWheelSteer = input.maxRoadWheelSteer ?? profile.maxRoadWheelSteer;
  const steeringOffsetMax = input.steeringOffsetMax ?? profile.steeringOffsetMax;
  const steeringActuatorResponse = input.steeringActuatorResponse ?? profile.actuator.steering;
  assertArcadeSteeringAngleCalibration({ maxRoadWheelSteer, steeringOffsetMax });
  validateSymmetricSteeringActuatorRateProfile(steeringActuatorResponse);
  return {
    maxRoadWheelSteer,
    steeringOffsetMax,
    steeringActuatorResponse: immutableRateProfile(steeringActuatorResponse),
  };
}

export function assertArcadeSteeringAngleCalibration(
  calibration: Pick<ArcadeSteeringCalibrationState, 'maxRoadWheelSteer' | 'steeringOffsetMax'>,
): void {
  const { maxRoadWheelSteer, steeringOffsetMax } = calibration;
  if (!(maxRoadWheelSteer > 0) || !(maxRoadWheelSteer < Math.PI / 2)
    || !Number.isFinite(maxRoadWheelSteer)) {
    throw new RangeError('vehicle maximum road-wheel steer must be finite and lie in (0, pi/2)');
  }
  if (!(steeringOffsetMax > 0) || !(steeringOffsetMax < maxRoadWheelSteer)
    || !Number.isFinite(steeringOffsetMax)) {
    throw new RangeError('vehicle steering offset must be finite and lie in (0, maximum steer)');
  }
}

/** Derived automatic travel-direction authority. Never store a second authored A value. */
export function steeringAutomaticMax(
  calibration: Pick<ArcadeSteeringCalibrationState, 'maxRoadWheelSteer' | 'steeringOffsetMax'>,
): number {
  assertArcadeSteeringAngleCalibration(calibration);
  return calibration.maxRoadWheelSteer - calibration.steeringOffsetMax;
}

export function setArcadeVehicleMaxRoadWheelSteer(
  vehicle: ArcadeSteeringCalibrationOwner,
  maxRoadWheelSteer: number,
): void {
  assertArcadeSteeringAngleCalibration({
    maxRoadWheelSteer,
    steeringOffsetMax: vehicle.steeringCalibration.steeringOffsetMax,
  });
  vehicle.steeringCalibration.maxRoadWheelSteer = maxRoadWheelSteer;
}

export function setArcadeVehicleSteeringOffsetMax(
  vehicle: ArcadeSteeringCalibrationOwner,
  steeringOffsetMax: number,
): void {
  assertArcadeSteeringAngleCalibration({
    maxRoadWheelSteer: vehicle.steeringCalibration.maxRoadWheelSteer,
    steeringOffsetMax,
  });
  vehicle.steeringCalibration.steeringOffsetMax = steeringOffsetMax;
}

export function setArcadeVehicleSymmetricSteeringActuatorRate(
  vehicle: ArcadeSteeringCalibrationOwner,
  rate: number,
): void {
  assertPositiveFiniteSteeringActuatorRate(rate);
  vehicle.steeringCalibration.steeringActuatorResponse = immutableRateProfile({
    applyRate: rate,
    releaseRate: rate,
  });
}

function immutableRateProfile(
  profile: NormalizedActuatorRateProfile,
): Readonly<NormalizedActuatorRateProfile> {
  return Object.freeze({
    applyRate: profile.applyRate,
    releaseRate: profile.releaseRate,
  });
}

function assertPositiveFiniteSteeringActuatorRate(rate: number): void {
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError('vehicle steering actuator rate must be finite and > 0');
  }
}
