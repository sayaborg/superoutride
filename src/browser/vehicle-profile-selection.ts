import type { CompiledArcadeVehicleProfile, VehicleProfileId } from '../physics/vehicle-profiles.js';
import {
  VEHICLE_CATALOG,
  formatVehicleCatalogLine,
  vehicleCatalogEntryForId,
  type VehicleSelectionKeyCode,
  type VehicleCatalogEntry,
} from '../vehicle/vehicle-catalog.js';

export interface BrowserVehicleProfileSelection {
  readonly code?: VehicleSelectionKeyCode;
  readonly keyLabel?: string;
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly profile: Readonly<CompiledArcadeVehicleProfile>;
}

export function createBrowserVehicleProfileSelections(
  catalog: readonly Readonly<VehicleCatalogEntry>[],
): readonly BrowserVehicleProfileSelection[] {
  return Object.freeze(catalog.map((catalogEntry) => Object.freeze({
    code: catalogEntry.keyCode,
    keyLabel: catalogEntry.keyLabel,
    mobileLabel: catalogEntry.mobileLabel,
    accessibleName: formatVehicleCatalogLine(catalogEntry),
    profile: catalogEntry.profile,
  })));
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
