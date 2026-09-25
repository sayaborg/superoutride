import { contentDigest } from '../core/content-digest.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SessionVehicle } from './session-configuration.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';

/** The two admitted definitions a Session drives, shared by browser, race, tools and scenarios. */
export function createSessionVehicle(
  vehicleDefinition: CompiledVehicleDefinition,
  drivingDefinition: CompiledDrivingDefinition,
  surfaceMaterials: SurfaceMaterialCatalog,
): SessionVehicle {
  return Object.freeze({ vehicleDefinition, drivingDefinition, surfaceMaterials });
}

/** Reference identity: saved vehicle, game-wide driving and surface-material definitions. */
export function sessionVehicleSha256(vehicle: SessionVehicle): Promise<string> {
  const identity = JSON.stringify({
    vehicle: vehicle.vehicleDefinition.source,
    driving: vehicle.drivingDefinition.source,
    surfaceMaterials: vehicle.surfaceMaterials.source,
  });
  return contentDigest(new TextEncoder().encode(identity));
}
