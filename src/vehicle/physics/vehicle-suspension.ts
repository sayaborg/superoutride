import { DefinitionDomainError } from '../../core/admission.js';
import { VEHICLE_GRAVITY } from './vehicle-state.js';

export type VehicleContactId = 'FRONT' | 'REAR';

export interface CompiledSuspensionStation {
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
  return Object.freeze({ springRate, damping, qStatic, qTravel });
}

/**
 * Explicit substep stability of one station's suspension, evaluated in isolation (no pitch coupling)
 * at full-travel stiffness P*k with the matching damping sqrt(P)*c on the static-load mass m = W/g:
 * h^2*P*k/m + 2*h*sqrt(P)*c/m, equal to (w*sqrt(P)*h)^2 + 4*z*w*sqrt(P)*h. Stable below 4.
 */
export function suspensionStabilityMeasure(
  suspension: CompiledSuspensionStation,
  progression: number,
  substep: number,
): number {
  const { springRate, damping, qStatic } = suspension;
  const mass = (springRate * qStatic) / VEHICLE_GRAVITY;
  return (
    (substep * substep * progression * springRate) / mass + (2 * substep * Math.sqrt(progression) * damping) / mass
  );
}

export function assertSuspensionStability(
  vehicleId: string,
  station: CompiledContactStation,
  progression: number,
  substep: number,
): void {
  const measure = suspensionStabilityMeasure(station.suspension, progression, substep);
  if (!(measure < 4))
    throw new RangeError(
      `vehicle ${vehicleId} ${station.id} suspension is unstable at substep ${substep} s: ${measure} >= 4`,
    );
}

/**
 * One progressive spring and its damper. Stiffness is springRate up to qStatic, then rises linearly
 * to springRate*progression at qTravel and continues that line; the spring force is its integral.
 * Damping keeps the station's damping ratio at the local stiffness: damping*sqrt(stiffness/springRate).
 */
export function suspensionForce(
  q: number,
  qDot: number,
  suspension: CompiledSuspensionStation,
  progression: number,
): number {
  const { springRate, damping, qStatic, qTravel } = suspension;
  const x = Math.max(0, q - qStatic);
  const stiffnessScale = 1 + ((progression - 1) * x) / (qTravel - qStatic);
  const spring = springRate * (q + ((progression - 1) * x * x) / (2 * (qTravel - qStatic)));
  return spring + damping * Math.sqrt(stiffnessScale) * qDot;
}
