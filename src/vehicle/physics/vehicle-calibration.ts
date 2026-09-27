import { DefinitionDomainError } from '../../core/admission.js';

/** Steering geometry in road-wheel radians, with the automatic travel-direction authority derived once. */
export interface CompiledVehicleSteeringCalibration {
  readonly maxRoadWheelSteer: number;
  readonly steeringOffsetMax: number;
  /** A = M-D; never a second authored value. */
  readonly automaticSteerMax: number;
}

export function createVehicleSteeringCalibration(
  maxRoadWheelSteer: number,
  steeringOffsetMax: number,
): Readonly<CompiledVehicleSteeringCalibration> {
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
  return Object.freeze({
    maxRoadWheelSteer,
    steeringOffsetMax,
    automaticSteerMax: maxRoadWheelSteer - steeringOffsetMax,
  });
}
