import { clamp } from '../core/math.js';
import { VEHICLE_GRAVITY } from '../physics/vehicle-dynamics.js';

export interface VehicleTurnPresentationRead {
  readonly longitudinalSpeed?: number;
  readonly yawRate?: number;
}

export interface VehicleIdentityPresentationRead {
  readonly profile: {
    readonly id: 'CAR' | 'BIKE';
  };
}

export type VehicleSpriteFamily = 'car' | 'bike';

export function deriveVehicleSpriteFamily(
  vehicle: VehicleIdentityPresentationRead,
): VehicleSpriteFamily {
  return vehicle.profile.id === 'BIKE' ? 'bike' : 'car';
}

export function formatVehiclePresentationName(vehicle: VehicleIdentityPresentationRead): string {
  return vehicle.profile.id === 'BIKE' ? 'MOTORCYCLE' : 'CAR';
}

/** Coordinated-turn lean is presentation only and never feeds vehicle mechanics. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnPresentationRead): number {
  return clamp(
    Math.atan2(
      (vehicle.yawRate ?? 0) * (vehicle.longitudinalSpeed ?? 0),
      VEHICLE_GRAVITY,
    ),
    -0.70,
    0.70,
  );
}

export function deriveVehicleNormalizedBank(vehicle: VehicleTurnPresentationRead): number {
  return clamp(deriveVehicleLeanRadians(vehicle) / (45 * Math.PI / 180), -1, 1);
}
