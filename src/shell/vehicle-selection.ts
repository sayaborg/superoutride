import { formatVehicleCatalogLine } from '../vehicle/vehicle-label.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompiledVehicle } from '../vehicle/physics/vehicle-definitions.js';
export interface BrowserVehicleSelection {
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly compiledVehicle: Readonly<CompiledVehicle>;
}

export function createBrowserVehicleSelections(
  catalog: readonly Readonly<CompiledVehicleDefinition>[],
): readonly BrowserVehicleSelection[] {
  return Object.freeze(
    catalog.map((catalogEntry) =>
      Object.freeze({
        mobileLabel: catalogEntry.mobileLabel,
        accessibleName: formatVehicleCatalogLine(catalogEntry),
        compiledVehicle: catalogEntry.compiledVehicle,
      }),
    ),
  );
}

export function formatVehicleSelector(entry: CompiledVehicleDefinition): string {
  return formatVehicleCatalogLine(entry);
}
