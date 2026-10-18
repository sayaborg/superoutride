import { DefinitionDomainError } from '../core/admission.js';
import type { WheelSlipProtection } from './physics/torque-protection.js';
import type { DriverSteering } from './physics/vehicle-calibration.js';
import type { VehicleModel } from './physics/vehicle-model.js';

/** The reference position the steering lever is measured from: the front wheel or the centre of mass. */
export type SteeringReference = 'front' | 'center';
export const STEERING_REFERENCES: readonly SteeringReference[] = Object.freeze(['front', 'center']);

/**
 * A driver's steering rule: the reference position and the front tire's utilization at full input. It belongs to whoever
 * drives a vehicle, not to the vehicle.
 */
export interface SteeringRule {
  readonly reference: SteeringReference;
  readonly utilization: number;
}

export function createSteeringRule(reference: SteeringReference, utilization: number): Readonly<SteeringRule> {
  if (!STEERING_REFERENCES.includes(reference))
    throw new DefinitionDomainError('reference', 'steering reference must be front or center');
  if (!(utilization > 0 && utilization <= 1))
    throw new DefinitionDomainError('utilization', 'steering utilization must lie in (0,1]');
  return Object.freeze({ reference, utilization });
}

/**
 * A driver's rule as the step of `model`'s vehicle applies it: the steering reference's lever (0 at the front wheel,
 * the front axle's distance from the centre of mass at the centre), its utilization and the torque protection with
 * `wheelSlip`, by default the vehicle's own (the player's input drives with it); the pitch limit is the model's.
 */
export function driverSteering(
  rule: SteeringRule,
  model: VehicleModel,
  wheelSlip: Readonly<WheelSlipProtection> = model.torqueProtection.wheelSlip,
): Readonly<DriverSteering> {
  const { torqueProtection } = model;
  const { drive, brake } = wheelSlip;
  return Object.freeze({
    lever: rule.reference === 'front' ? 0 : model.compiledVehicle.frontAxle,
    utilization: rule.utilization,
    torqueProtection:
      drive === torqueProtection.wheelSlip.drive && brake === torqueProtection.wheelSlip.brake
        ? torqueProtection
        : Object.freeze({ wheelSlip: Object.freeze({ drive, brake }), pitchLimit: torqueProtection.pitchLimit }),
  });
}
