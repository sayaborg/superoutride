import {
  validateSymmetricSteeringActuatorRateDefinition,
  type NormalizedActuatorRateDefinition,
} from './driving-actuator.js';

/** The selectable steering geometry/response values. Angles are road-wheel radians. */
export interface VehicleSteeringCalibrationInput {
  readonly maxRoadWheelSteer: number;
  readonly steeringOffsetMax: number;
  readonly steeringActuatorResponse: NormalizedActuatorRateDefinition;
}

export interface VehicleSteeringCalibrationState {
  maxRoadWheelSteer: number;
  steeringOffsetMax: number;
  steeringActuatorResponse: Readonly<NormalizedActuatorRateDefinition>;
}

interface VehicleSteeringCalibrationOwner {
  readonly steeringCalibration: VehicleSteeringCalibrationState;
}

export function createVehicleSteeringCalibration(
  input: VehicleSteeringCalibrationInput,
): VehicleSteeringCalibrationState {
  const maxRoadWheelSteer = input.maxRoadWheelSteer;
  const steeringOffsetMax = input.steeringOffsetMax;
  const steeringActuatorResponse = input.steeringActuatorResponse;
  assertVehicleSteeringAngleCalibration({ maxRoadWheelSteer, steeringOffsetMax });
  validateSymmetricSteeringActuatorRateDefinition(steeringActuatorResponse);
  return {
    maxRoadWheelSteer,
    steeringOffsetMax,
    steeringActuatorResponse: immutableRateDefinition(steeringActuatorResponse),
  };
}

function assertVehicleSteeringAngleCalibration(
  calibration: Pick<VehicleSteeringCalibrationState, 'maxRoadWheelSteer' | 'steeringOffsetMax'>,
): void {
  const { maxRoadWheelSteer, steeringOffsetMax } = calibration;
  if (!(maxRoadWheelSteer > 0) || !(maxRoadWheelSteer < Math.PI / 2) || !Number.isFinite(maxRoadWheelSteer)) {
    throw new RangeError('vehicle maximum road-wheel steer must be finite and lie in (0, pi/2)');
  }
  if (!(steeringOffsetMax > 0) || !(steeringOffsetMax < maxRoadWheelSteer) || !Number.isFinite(steeringOffsetMax)) {
    throw new RangeError('vehicle steering offset must be finite and lie in (0, maximum steer)');
  }
}

/** Derived automatic travel-direction authority. Never store a second authored A value. */
export function steeringAutomaticMax(
  calibration: Pick<VehicleSteeringCalibrationState, 'maxRoadWheelSteer' | 'steeringOffsetMax'>,
): number {
  assertVehicleSteeringAngleCalibration(calibration);
  return calibration.maxRoadWheelSteer - calibration.steeringOffsetMax;
}

export function setVehicleMaxRoadWheelSteer(vehicle: VehicleSteeringCalibrationOwner, maxRoadWheelSteer: number): void {
  assertVehicleSteeringAngleCalibration({
    maxRoadWheelSteer,
    steeringOffsetMax: vehicle.steeringCalibration.steeringOffsetMax,
  });
  vehicle.steeringCalibration.maxRoadWheelSteer = maxRoadWheelSteer;
}

export function setVehicleSteeringOffsetMax(vehicle: VehicleSteeringCalibrationOwner, steeringOffsetMax: number): void {
  assertVehicleSteeringAngleCalibration({
    maxRoadWheelSteer: vehicle.steeringCalibration.maxRoadWheelSteer,
    steeringOffsetMax,
  });
  vehicle.steeringCalibration.steeringOffsetMax = steeringOffsetMax;
}

export function setVehicleSymmetricSteeringActuatorRate(vehicle: VehicleSteeringCalibrationOwner, rate: number): void {
  assertPositiveFiniteSteeringActuatorRate(rate);
  vehicle.steeringCalibration.steeringActuatorResponse = immutableRateDefinition({
    applyRate: rate,
    releaseRate: rate,
  });
}

function immutableRateDefinition(
  definition: NormalizedActuatorRateDefinition,
): Readonly<NormalizedActuatorRateDefinition> {
  return Object.freeze({
    applyRate: definition.applyRate,
    releaseRate: definition.releaseRate,
  });
}

function assertPositiveFiniteSteeringActuatorRate(rate: number): void {
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError('vehicle steering actuator rate must be finite and > 0');
  }
}
