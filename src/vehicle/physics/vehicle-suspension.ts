import { DefinitionDomainError } from '../../core/admission.js';
import { VEHICLE_GRAVITY } from './vehicle-state.js';

export type VehicleContactId = 'FRONT' | 'REAR';

export interface CompiledSuspensionStation {
  /** The station's share of the vehicle's weight at rest (N). */
  readonly staticLoad: number;
  readonly springRate: number;
  readonly damping: number;
  readonly qStatic: number;
  readonly qTravel: number;
}

export interface CompiledContactStation {
  readonly id: VehicleContactId;
  readonly forwardOffset: number;
  /** CG-to-free-reach distance along body down at maximum suspension extension. */
  readonly freeReachDown: number;
  readonly rollingRadius: number;
  readonly wheelInertia: number;
  readonly maxBrakeTorque: number;
  readonly suspension: CompiledSuspensionStation;
}

export function compileSuspensionStation(
  staticLoad: number,
  rideFrequency: number,
  dampingRatio: number,
  qTravel: number,
): CompiledSuspensionStation {
  for (const [field, value] of Object.entries({ staticLoad, rideFrequency, dampingRatio, qTravel })) {
    if (!Number.isFinite(value)) throw new DefinitionDomainError(field, `${field} must be finite`);
  }
  if (!(staticLoad > 0))
    throw new DefinitionDomainError('staticLoad', 'staticLoad derived from mass and axle distances must be > 0');
  if (!(rideFrequency > 0)) throw new DefinitionDomainError('rideFrequency', 'rideFrequency must be > 0');
  if (!(dampingRatio >= 0)) throw new DefinitionDomainError('dampingRatio', 'dampingRatio must be >= 0');
  const effectiveMass = staticLoad / VEHICLE_GRAVITY;
  const omega = 2 * Math.PI * rideFrequency;
  const springRate = omega ** 2 * effectiveMass;
  const damping = 2 * dampingRatio * Math.sqrt(springRate * effectiveMass);
  const qStatic = staticLoad / springRate;
  if (!(qStatic > 0))
    throw new DefinitionDomainError('rideFrequency', 'rideFrequency and staticLoad must produce qStatic > 0');
  if (!(qStatic < qTravel))
    throw new DefinitionDomainError(
      Number.isFinite(qStatic) ? 'qTravel' : 'rideFrequency',
      'qTravel must exceed qStatic derived from rideFrequency and staticLoad',
    );
  return Object.freeze({ staticLoad, springRate, damping, qStatic, qTravel });
}

/**
 * Explicit substep stability of one station's suspension, evaluated in isolation (no pitch coupling) on the
 * static-load mass m = W/g: h^2*k/m + 2*h*c/m, equal to (w*h)^2 + 4*z*w*h. Stable below 4.
 */
export function suspensionStabilityMeasure(suspension: CompiledSuspensionStation, substep: number): number {
  const { springRate, damping, staticLoad } = suspension;
  const mass = staticLoad / VEHICLE_GRAVITY;
  return (substep * substep * springRate) / mass + (2 * substep * damping) / mass;
}

export function assertSuspensionStability(vehicleId: string, station: CompiledContactStation, substep: number): void {
  const measure = suspensionStabilityMeasure(station.suspension, substep);
  if (!(measure < 4))
    throw new RangeError(
      `vehicle ${vehicleId} ${station.id} suspension is unstable at substep ${substep} s: ${measure} >= 4`,
    );
}

/** One linear spring and its damper: springRate*q + damping*qDot. */
export function suspensionForce(q: number, qDot: number, suspension: CompiledSuspensionStation): number {
  return suspension.springRate * q + suspension.damping * qDot;
}
