import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
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

export function createVehicleSteeringCalibration(
  input: VehicleSteeringCalibrationInput,
): VehicleSteeringCalibrationState {
  const maxRoadWheelSteer = input.maxRoadWheelSteer;
  const steeringOffsetMax = input.steeringOffsetMax;
  const steeringActuatorResponse = input.steeringActuatorResponse;
  assertVehicleSteeringAngleCalibration({ maxRoadWheelSteer, steeringOffsetMax });
  withDefinitionPath(
    () => validateSymmetricSteeringActuatorRateDefinition(steeringActuatorResponse),
    (path) => `steeringActuatorResponse/${path}`,
  );
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
    throw new DefinitionDomainError(
      'maxRoadWheelSteer',
      'vehicle maximum road-wheel steer must be finite and lie in (0, pi/2)',
    );
  }
  if (!(steeringOffsetMax > 0) || !(steeringOffsetMax < maxRoadWheelSteer) || !Number.isFinite(steeringOffsetMax)) {
    throw new DefinitionDomainError(
      'steeringOffsetMax',
      'steeringOffsetMax must be finite and lie in (0, maxRoadWheelSteer)',
    );
  }
}

/** Derived automatic travel-direction authority. Never store a second authored A value. */
export function steeringAutomaticMax(
  calibration: Pick<VehicleSteeringCalibrationState, 'maxRoadWheelSteer' | 'steeringOffsetMax'>,
): number {
  assertVehicleSteeringAngleCalibration(calibration);
  return calibration.maxRoadWheelSteer - calibration.steeringOffsetMax;
}

function immutableRateDefinition(
  definition: NormalizedActuatorRateDefinition,
): Readonly<NormalizedActuatorRateDefinition> {
  return Object.freeze({
    applyRate: definition.applyRate,
    releaseRate: definition.releaseRate,
  });
}
