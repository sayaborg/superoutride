import { DefinitionDomainError } from '../../core/admission.js';
import { radialKneeInverse, type CompiledTireCharacteristics } from './tire-friction-calibration.js';

/**
 * The travel direction steering is measured from: the body's centre of mass or the front contact's reach point; `turn`
 * measures from the centre of mass and widens the limit by the front axle's angle on the tightest steady turn.
 */
export type SteeringReference = 'center' | 'front' | 'turn';

/**
 * Steering in road-wheel radians: the rack bound, the travel direction the steering limit is measured from, the
 * normalized radial demand `rho` at which full input sets the front tire's pure-lateral slip, and the steering
 * utilization `X` itself. The limit itself derives from the tire and the material each step.
 */
export interface CompiledVehicleSteeringCalibration {
  readonly maxRoadWheelSteer: number;
  readonly reference: SteeringReference;
  readonly utilization: number;
  readonly limitDemand: number;
}

export function createVehicleSteeringCalibration(
  maxRoadWheelSteer: number,
  reference: SteeringReference,
  utilization: number,
  tire: CompiledTireCharacteristics,
): Readonly<CompiledVehicleSteeringCalibration> {
  if (!(maxRoadWheelSteer > 0) || !(maxRoadWheelSteer < Math.PI / 2) || !Number.isFinite(maxRoadWheelSteer)) {
    throw new DefinitionDomainError(
      'maxRoadWheelSteer',
      'vehicle maximum road-wheel steer must be finite and lie in (0, pi/2)',
    );
  }
  if (reference !== 'center' && reference !== 'front' && reference !== 'turn')
    throw new DefinitionDomainError('reference', 'steering reference must be center, front or turn');
  if (!(utilization > 0 && utilization <= 1))
    throw new DefinitionDomainError('utilization', 'steering utilization must lie in (0,1]');
  return Object.freeze({
    maxRoadWheelSteer,
    reference,
    utilization,
    limitDemand: radialKneeInverse(tire.rhoKnee, utilization),
  });
}
