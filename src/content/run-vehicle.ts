import { contentDigest } from '../core/content-digest.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';

/** The vehicle and driving definitions a run drives; everything else derives from them. */
export interface RunVehicle {
  readonly vehicleDefinition: CompiledVehicleDefinition;
  readonly drivingDefinition: CompiledDrivingDefinition;
}

/** The two admitted definitions a run drives, shared by browser, race, tools and scenarios. */
export function createRunVehicle(
  vehicleDefinition: CompiledVehicleDefinition,
  drivingDefinition: CompiledDrivingDefinition,
): RunVehicle {
  return Object.freeze({ vehicleDefinition, drivingDefinition });
}

/**
 * Reference identity of a run vehicle on the surface material catalog it drives on: the delivered SHA-256 of the
 * vehicle mechanics, driving and material documents.
 */
export function runVehicleSha256(vehicle: RunVehicle, surfaceMaterials: SurfaceMaterialCatalog): Promise<string> {
  const driving = vehicle.drivingDefinition.sha256;
  if (driving === null) throw new Error('A driving definition outside delivery has no reference identity');
  const mechanics = vehicle.vehicleDefinition.mechanicsSha256;
  if (mechanics === null) throw new Error('A vehicle mechanics document outside delivery has no reference identity');
  const identity = JSON.stringify({
    vehicle: mechanics,
    driving,
    surfaceMaterials: surfaceMaterials.sha256,
  });
  return contentDigest(new TextEncoder().encode(identity));
}
