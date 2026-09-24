import { BROWSER_VEHICLE_KEYS } from './key-bindings.js';
import type { CompiledVehicle, VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import {
  VEHICLE_CATALOG,
  formatVehicleCatalogLine,
  vehicleCatalogEntryForId,
  type VehicleCatalogEntry,
} from '../vehicle/vehicle-catalog.js';

export interface BrowserVehicleSelection {
  readonly code?: string;
  readonly keyLabel?: string;
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly compiledVehicle: Readonly<CompiledVehicle>;
}

function createBrowserVehicleSelections(
  catalog: readonly Readonly<VehicleCatalogEntry>[],
  keys: Readonly<Record<string, string>> = BROWSER_VEHICLE_KEYS,
): readonly BrowserVehicleSelection[] {
  const used = new Set<string>();
  return Object.freeze(
    catalog.map((catalogEntry) => {
      const code = Object.hasOwn(keys, catalogEntry.compiledVehicle.id)
        ? keys[catalogEntry.compiledVehicle.id]
        : undefined;
      if (code !== undefined) {
        if (typeof code !== 'string' || !code.trim() || used.has(code))
          throw new RangeError(`invalid or duplicate vehicle shortcut: ${code}`);
        used.add(code);
      }
      return Object.freeze({
        code,
        keyLabel: code?.replace(/^Key/, ''),
        mobileLabel: catalogEntry.mobileLabel,
        accessibleName: formatVehicleCatalogLine(catalogEntry),
        compiledVehicle: catalogEntry.compiledVehicle,
      });
    }),
  );
}

export const BROWSER_VEHICLE_SELECTIONS = createBrowserVehicleSelections(VEHICLE_CATALOG);

export function browserVehicleForKey(
  code: string,
  selections = BROWSER_VEHICLE_SELECTIONS,
): Readonly<CompiledVehicle> | null {
  return selections.find((selection) => selection.code === code)?.compiledVehicle ?? null;
}

export function formatVehicleSelector(activeId: VehicleId): string {
  return formatVehicleCatalogLine(vehicleCatalogEntryForId(activeId));
}
