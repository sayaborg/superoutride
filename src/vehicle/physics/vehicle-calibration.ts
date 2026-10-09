import { DefinitionDomainError } from '../../core/admission.js';

/** Steering geometry in road-wheel radians: the rack bound. The steering limit derives from the tire each step. */
export interface CompiledVehicleSteeringCalibration {
  readonly maxRoadWheelSteer: number;
}

export function createVehicleSteeringCalibration(
  maxRoadWheelSteer: number,
): Readonly<CompiledVehicleSteeringCalibration> {
  if (!(maxRoadWheelSteer > 0) || !(maxRoadWheelSteer < Math.PI / 2) || !Number.isFinite(maxRoadWheelSteer)) {
    throw new DefinitionDomainError(
      'maxRoadWheelSteer',
      'vehicle maximum road-wheel steer must be finite and lie in (0, pi/2)',
    );
  }
  return Object.freeze({ maxRoadWheelSteer });
}
