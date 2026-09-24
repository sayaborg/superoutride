import type { SessionVehicle } from '../race/session-configuration.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';

// Temporary form-specific policy until airborne support is revised in 8-7; never saved as vehicle data.
const TWO_WHEEL_SUPPORT_RESERVE = 0.08;

/** Explicit admitted inputs shared by browser, race, offline tools and scenarios. */
export function browserSessionVehicle(
  entry: CompiledVehicleDefinition,
  drivingDefinition: CompiledDrivingDefinition,
): SessionVehicle {
  return Object.freeze({
    compiledVehicle: entry.compiledVehicle,
    drivingDefinition,
    supportReserve: entry.form === 'bike' ? TWO_WHEEL_SUPPORT_RESERVE : null,
    form: entry.form,
    vehicleDefinition: entry.source,
  });
}
