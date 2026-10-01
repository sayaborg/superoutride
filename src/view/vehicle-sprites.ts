import { createVehiclePaletteVariant, type VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';

export interface VehicleSpriteStates {
  readonly off: VehicleSpriteSet;
  readonly on: VehicleSpriteSet;
}

/** One vehicle's binding in one of its colors, by default its default color; each image supplies its own palette. */
export function createVehicleSprites(
  vehicle: CompiledVehicleDefinition,
  color = vehicle.listing.visuals.palette,
): VehicleSpriteStates {
  return Object.freeze({
    off: createVehiclePaletteVariant(vehicle.spriteSet, color),
    on: createVehiclePaletteVariant(vehicle.spriteSet, color, true),
  });
}
