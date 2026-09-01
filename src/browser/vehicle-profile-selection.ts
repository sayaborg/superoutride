import type { CompiledArcadeVehicleProfile, VehicleProfileId } from '../physics/vehicle-profiles.js';
import {
  VEHICLE_CATALOG,
  formatVehicleCatalogLine,
  vehicleCatalogEntryForId,
  type VehicleSelectionKeyCode,
} from '../vehicle/vehicle-catalog.js';

export interface BrowserVehicleProfileSelection {
  readonly code: VehicleSelectionKeyCode;
  readonly keyLabel: string;
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly profile: Readonly<CompiledArcadeVehicleProfile>;
}

export const BROWSER_VEHICLE_PROFILES: readonly BrowserVehicleProfileSelection[] = Object.freeze(
  VEHICLE_CATALOG.map((catalogEntry) => Object.freeze({
    code: catalogEntry.keyCode,
    keyLabel: catalogEntry.keyLabel,
    mobileLabel: catalogEntry.mobileLabel,
    accessibleName: formatVehicleCatalogLine(catalogEntry),
    profile: catalogEntry.profile,
  })),
);

export function browserVehicleProfileForKey(
  code: string,
): Readonly<CompiledArcadeVehicleProfile> | null {
  return BROWSER_VEHICLE_PROFILES.find((selection) => selection.code === code)?.profile ?? null;
}

export function formatVehicleProfileSelector(activeId: VehicleProfileId): string {
  return formatVehicleCatalogLine(vehicleCatalogEntryForId(activeId));
}
