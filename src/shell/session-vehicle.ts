import type { SessionVehicle } from '../race/session-configuration.js';
import type { VehicleCatalogEntry } from '../vehicle/vehicle-catalog.js';
import { DRIVING_DEFINITION } from '../vehicle/driving-definition.js';

/** One product definition shared by browser, race, offline tools and scenarios. */
export function browserSessionVehicle(entry: VehicleCatalogEntry): SessionVehicle {
  return Object.freeze({
    compiledVehicle: entry.compiledVehicle,
    drivingDefinition: DRIVING_DEFINITION,
    supportReserve: entry.supportReserve,
    kind: entry.visualFamily === 'CAR' ? 'car' : 'bike',
  });
}
