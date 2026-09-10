import { BROWSER_VEHICLE_KEYS } from './key-bindings.js';
import type { CompiledArcadeVehicleProfile, VehicleProfileId } from '../physics/vehicle-profiles.js';
import {
  VEHICLE_CATALOG,
  formatVehicleCatalogLine,
  vehicleCatalogEntryForId,
  type VehicleCatalogEntry,
} from '../vehicle/vehicle-catalog.js';

export interface BrowserVehicleProfileSelection {
  readonly code?: string;
  readonly keyLabel?: string;
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly profile: Readonly<CompiledArcadeVehicleProfile>;
}

export function createBrowserVehicleProfileSelections(
  catalog: readonly Readonly<VehicleCatalogEntry>[],
  keys: Readonly<Record<string, string>> = BROWSER_VEHICLE_KEYS,
): readonly BrowserVehicleProfileSelection[] {
  const used = new Set<string>();
  return Object.freeze(
    catalog.map((catalogEntry) => {
      const code = Object.hasOwn(keys, catalogEntry.profile.id) ? keys[catalogEntry.profile.id] : undefined;
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
        profile: catalogEntry.profile,
      });
    }),
  );
}

export const BROWSER_VEHICLE_PROFILES = createBrowserVehicleProfileSelections(VEHICLE_CATALOG);

export function browserVehicleProfileForKey(
  code: string,
  selections = BROWSER_VEHICLE_PROFILES,
): Readonly<CompiledArcadeVehicleProfile> | null {
  return selections.find((selection) => selection.code === code)?.profile ?? null;
}

export function formatVehicleProfileSelector(activeId: VehicleProfileId): string {
  return formatVehicleCatalogLine(vehicleCatalogEntryForId(activeId));
}
