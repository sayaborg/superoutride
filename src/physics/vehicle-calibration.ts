import type { NormalizedActuatorRateProfile } from './driving-actuator.js';
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

export interface ArcadeSteeringFeedbackCalibration {
  readonly travelDirectionGain: number;
  readonly yawPreviewTime: number;
}

export interface ArcadeSteeringCalibrationInput {
  readonly travelDirectionGain?: number;
  readonly yawPreviewTime?: number;
  readonly steeringActuatorResponse?: NormalizedActuatorRateProfile;
}

export interface ArcadeSteeringCalibrationState extends ArcadeSteeringFeedbackCalibration {
  travelDirectionGain: number;
  yawPreviewTime: number;
  steeringActuatorResponse: Readonly<NormalizedActuatorRateProfile>;
}

export interface ArcadeSteeringCalibrationOwner {
  readonly steeringCalibration: ArcadeSteeringCalibrationState;
}

export function createArcadeSteeringCalibration(
  profile: CompiledArcadeVehicleProfile,
  input: ArcadeSteeringCalibrationInput = {},
): ArcadeSteeringCalibrationState {
  const travelDirectionGain = input.travelDirectionGain ?? 1;
  const yawPreviewTime = input.yawPreviewTime ?? profile.steeringYawPreviewTime;
  const steeringActuatorResponse = input.steeringActuatorResponse ?? profile.actuator.steering;
  assertArcadeSteeringFeedbackCalibration({ travelDirectionGain, yawPreviewTime });
  assertPositiveFiniteSteeringActuatorRate(steeringActuatorResponse.applyRate);
  assertPositiveFiniteSteeringActuatorRate(steeringActuatorResponse.releaseRate);
  return {
    travelDirectionGain,
    yawPreviewTime,
    steeringActuatorResponse: immutableRateProfile(steeringActuatorResponse),
  };
}

export function assertArcadeSteeringFeedbackCalibration(
  calibration: ArcadeSteeringFeedbackCalibration,
): void {
  assertTravelDirectionSteeringGain(calibration.travelDirectionGain);
  assertSteeringYawPreviewTime(calibration.yawPreviewTime);
}

export function setArcadeVehicleTravelDirectionSteeringGain(
  vehicle: ArcadeSteeringCalibrationOwner,
  gain: number,
): void {
  assertTravelDirectionSteeringGain(gain);
  vehicle.steeringCalibration.travelDirectionGain = gain;
}

export function setArcadeVehicleSteeringYawPreviewTime(
  vehicle: ArcadeSteeringCalibrationOwner,
  yawPreviewTime: number,
): void {
  assertSteeringYawPreviewTime(yawPreviewTime);
  vehicle.steeringCalibration.yawPreviewTime = yawPreviewTime;
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

function assertTravelDirectionSteeringGain(gain: number): void {
  if (!(gain >= 0 && gain <= 1) || !Number.isFinite(gain)) {
    throw new RangeError('vehicle travel-direction steering gain must be finite and lie in [0,1]');
  }
}

function assertSteeringYawPreviewTime(yawPreviewTime: number): void {
  if (!(yawPreviewTime >= 0) || !Number.isFinite(yawPreviewTime)) {
    throw new RangeError('vehicle steering yaw preview time must be finite and >= 0');
  }
}

function assertPositiveFiniteSteeringActuatorRate(rate: number): void {
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError('vehicle steering actuator rate must be finite and > 0');
  }
}
