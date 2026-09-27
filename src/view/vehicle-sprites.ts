import { createVehiclePaletteVariant, type VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';

export interface VehicleSpriteStates {
  readonly off: VehicleSpriteSet;
  readonly on: VehicleSpriteSet;
}

/** One startup binding shared by player and rivals; each image supplies its own named palette. */
export function createVehicleSprites(vehicle: CompiledVehicleDefinition): VehicleSpriteStates {
  const color = vehicle.listing.visuals.palette;
  return Object.freeze({
    off: createVehiclePaletteVariant(vehicle.spriteSet, color),
    on: createVehiclePaletteVariant(vehicle.spriteSet, color, true),
  });
}
