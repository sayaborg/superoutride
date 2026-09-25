import { clamp } from '../core/math.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-dynamics.js';
export interface VehicleTurnObservation {
  readonly lateralAcceleration?: number;
}

/** Flat-road equilibrium angle from observed lateral acceleration; visual only. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnObservation): number {
  return Math.atan2(vehicle.lateralAcceleration ?? 0, VEHICLE_GRAVITY);
}

export function deriveVehicleNormalizedBank(vehicle: VehicleTurnObservation): number {
  return clamp(deriveVehicleLeanRadians(vehicle) / ((45 * Math.PI) / 180), -1, 1);
}
