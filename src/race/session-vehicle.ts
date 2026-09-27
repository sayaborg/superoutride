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

/** Reference identity: the delivered SHA-256 of the vehicle mechanics, driving and material documents. */
export function sessionVehicleSha256(vehicle: SessionVehicle): Promise<string> {
  const driving = vehicle.drivingDefinition.sha256;
  if (driving === null) throw new Error('A driving definition outside delivery has no reference identity');
  const identity = JSON.stringify({
    vehicle: vehicle.vehicleDefinition.mechanicsSha256,
    driving,
    surfaceMaterials: vehicle.surfaceMaterials.sha256,
  });
  return contentDigest(new TextEncoder().encode(identity));
}
