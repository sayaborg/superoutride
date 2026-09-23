import { clamp } from '../core/math.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-dynamics.js';
import type { VehicleVisualFamily } from '../vehicle/vehicle-catalog.js';

export interface VehicleTurnObservation {
  readonly lateralAcceleration?: number;
}

interface VehicleVisualIdentity {
  readonly visualFamily: VehicleVisualFamily;
}

type VehicleSpriteFamily = 'car' | 'bike';

export function deriveVehicleSpriteFamily(vehicle: VehicleVisualIdentity): VehicleSpriteFamily {
  return vehicle.visualFamily === 'BIKE' ? 'bike' : 'car';
}

/** Flat-road equilibrium angle from observed lateral acceleration; visual only. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnObservation): number {
  return Math.atan2(vehicle.lateralAcceleration ?? 0, VEHICLE_GRAVITY);
}

export function deriveVehicleNormalizedBank(vehicle: VehicleTurnObservation): number {
  return clamp(deriveVehicleLeanRadians(vehicle) / ((45 * Math.PI) / 180), -1, 1);
}
