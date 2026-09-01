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

export interface ArcadeSteeringTransientCalibration {
  readonly yawTransientGain: number;
  readonly yawWashoutTime: number;
}

export interface ArcadeSteeringCalibrationInput {
  readonly yawTransientGain?: number;
  readonly yawWashoutTime?: number;
  readonly steeringActuatorResponse?: NormalizedActuatorRateProfile;
}

export interface ArcadeSteeringCalibrationState extends ArcadeSteeringTransientCalibration {
  yawTransientGain: number;
  yawWashoutTime: number;
  steeringActuatorResponse: Readonly<NormalizedActuatorRateProfile>;
}

export interface ArcadeSteeringCalibrationOwner {
  readonly steeringCalibration: ArcadeSteeringCalibrationState;
}

export function createArcadeSteeringCalibration(
  profile: CompiledArcadeVehicleProfile,
  input: ArcadeSteeringCalibrationInput = {},
): ArcadeSteeringCalibrationState {
  const yawTransientGain = input.yawTransientGain ?? profile.steeringYawTransientGain;
  const yawWashoutTime = input.yawWashoutTime ?? profile.steeringYawWashoutTime;
  const steeringActuatorResponse = input.steeringActuatorResponse ?? profile.actuator.steering;
  assertArcadeSteeringTransientCalibration({ yawTransientGain, yawWashoutTime });
  validateSymmetricSteeringActuatorRateProfile(steeringActuatorResponse);
  return {
    yawTransientGain,
    yawWashoutTime,
    steeringActuatorResponse: immutableRateProfile(steeringActuatorResponse),
  };
}

export function assertArcadeSteeringTransientCalibration(
  calibration: ArcadeSteeringTransientCalibration,
): void {
  assertNonNegativeFiniteYawTransientGain(calibration.yawTransientGain);
  assertPositiveFiniteYawWashoutTime(calibration.yawWashoutTime);
}

export function setArcadeVehicleSteeringYawTransientGain(
  vehicle: ArcadeSteeringCalibrationOwner,
  yawTransientGain: number,
): void {
  assertNonNegativeFiniteYawTransientGain(yawTransientGain);
  vehicle.steeringCalibration.yawTransientGain = yawTransientGain;
}

export function setArcadeVehicleSteeringYawWashoutTime(
  vehicle: ArcadeSteeringCalibrationOwner,
  yawWashoutTime: number,
): void {
  assertPositiveFiniteYawWashoutTime(yawWashoutTime);
  vehicle.steeringCalibration.yawWashoutTime = yawWashoutTime;
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

function assertNonNegativeFiniteYawTransientGain(gain: number): void {
  if (!(gain >= 0) || !Number.isFinite(gain)) {
    throw new RangeError('vehicle steering yaw transient gain must be finite and >= 0');
  }
}

function assertPositiveFiniteYawWashoutTime(time: number): void {
  if (!(time > 0) || !Number.isFinite(time)) {
    throw new RangeError('vehicle steering yaw washout time must be finite and > 0');
  }
}

function assertPositiveFiniteSteeringActuatorRate(rate: number): void {
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError('vehicle steering actuator rate must be finite and > 0');
  }
}
