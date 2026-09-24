import { clamp } from '../core/math.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-dynamics.js';
import type { VehicleForm } from '../vehicle/definition-document.js';

export interface VehicleTurnObservation {
  readonly lateralAcceleration?: number;
}

interface VehicleVisualIdentity {
  readonly form: VehicleForm;
}

type VehicleSpriteFamily = 'car' | 'bike';

export function deriveVehicleSpriteFamily(vehicle: VehicleVisualIdentity): VehicleSpriteFamily {
  return vehicle.form;
}

/** Flat-road equilibrium angle from observed lateral acceleration; visual only. */
export function deriveVehicleLeanRadians(vehicle: VehicleTurnObservation): number {
  return Math.atan2(vehicle.lateralAcceleration ?? 0, VEHICLE_GRAVITY);
}

export function deriveVehicleNormalizedBank(vehicle: VehicleTurnObservation): number {
  return clamp(deriveVehicleLeanRadians(vehicle) / ((45 * Math.PI) / 180), -1, 1);
}
