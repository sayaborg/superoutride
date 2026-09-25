import { contentDigest } from '../core/content-digest.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SessionVehicle } from './session-configuration.js';

/** The two admitted definitions a Session drives, shared by browser, race, tools and scenarios. */
export function createSessionVehicle(
  vehicleDefinition: CompiledVehicleDefinition,
  drivingDefinition: CompiledDrivingDefinition,
): SessionVehicle {
  return Object.freeze({ vehicleDefinition, drivingDefinition });
}

/** Vehicle identity for generated references: SHA-256 of both saved-form source documents. */
export function sessionVehicleSha256(vehicle: SessionVehicle): Promise<string> {
  const identity = JSON.stringify({
    vehicle: vehicle.vehicleDefinition.source,
    driving: vehicle.drivingDefinition.source,
  });
  return contentDigest(new TextEncoder().encode(identity));
}
