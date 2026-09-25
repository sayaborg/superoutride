import { createVehiclePaletteVariant, type VehicleSpriteSet } from '../image/sprite-assets.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';

export interface VehicleSpriteStates {
  readonly off: VehicleSpriteSet;
  readonly on: VehicleSpriteSet;
}

/** One startup binding shared by player and rivals; each image supplies its own named palette. */
export function createVehicleSprites(vehicle: CompiledVehicleDefinition): VehicleSpriteStates {
  const color = vehicle.source.visuals.palette;
  return Object.freeze({
    off: createVehiclePaletteVariant(vehicle.spriteSet, color),
    on: createVehiclePaletteVariant(vehicle.spriteSet, color, true),
  });
}
