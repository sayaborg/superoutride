import { DefinitionDomainError } from '../../core/admission.js';

/** The steering rack: its bound `M` in road-wheel radians, the one steering limit of the vehicle's mechanism. */
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

/**
 * The steering rule of whoever drives the vehicle, as the vehicle step applies it: the lever in metres from the
 * reference position to the front axle and the front tire's utilization `X` at full input.
 */
export interface DriverSteering {
  readonly lever: number;
  readonly utilization: number;
}
