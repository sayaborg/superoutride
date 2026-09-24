import { formatVehicleCatalogLine } from '../vehicle/vehicle-label.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { BROWSER_VEHICLE_KEYS } from './key-bindings.js';
import type { CompiledVehicle } from '../vehicle/physics/vehicle-definitions.js';
export interface BrowserVehicleSelection {
  readonly code?: string;
  readonly keyLabel?: string;
  readonly mobileLabel: string;
  readonly accessibleName: string;
  readonly compiledVehicle: Readonly<CompiledVehicle>;
}

export function createBrowserVehicleSelections(
  catalog: readonly Readonly<CompiledVehicleDefinition>[],
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

export function browserVehicleForKey(
  code: string,
  selections: readonly BrowserVehicleSelection[],
): Readonly<CompiledVehicle> | null {
  return selections.find((selection) => selection.code === code)?.compiledVehicle ?? null;
}

export function formatVehicleSelector(entry: CompiledVehicleDefinition): string {
  return formatVehicleCatalogLine(entry);
}
