import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-state.js';
export interface VehicleTurnObservation {
  readonly lateralAcceleration: number;
}

/** Flat-road equilibrium angle from observed lateral acceleration; visual only. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnObservation): number {
  return Math.atan2(vehicle.lateralAcceleration, VEHICLE_GRAVITY);
}
