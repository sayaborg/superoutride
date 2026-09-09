import { clamp } from '../core/math.js';
import { VEHICLE_GRAVITY } from '../physics/vehicle-dynamics.js';
export type VehiclePresentationFamily = 'CAR' | 'BIKE';

export interface VehicleTurnPresentationRead {
  readonly lateralAcceleration?: number;
}

export interface VehicleIdentityPresentationRead {
  readonly presentationFamily: VehiclePresentationFamily;
}

export type VehicleSpriteFamily = 'car' | 'bike';

export function deriveVehicleSpriteFamily(
  vehicle: VehicleIdentityPresentationRead,
): VehicleSpriteFamily {
  return vehicle.presentationFamily === 'BIKE' ? 'bike' : 'car';
}

/** Flat-road equilibrium angle from observed lateral acceleration; presentation only. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnPresentationRead): number {
  return Math.atan2(vehicle.lateralAcceleration ?? 0, VEHICLE_GRAVITY);
}

export function deriveVehicleNormalizedBank(vehicle: VehicleTurnPresentationRead): number {
  return clamp(deriveVehicleLeanRadians(vehicle) / (45 * Math.PI / 180), -1, 1);
}
