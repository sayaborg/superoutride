import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { readSpriteAssets, type SpriteAssets } from '../image/sprite-assets.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import {
  compileDrivingDocument,
  compileVehicleDocument,
  type CompiledVehicleDefinition,
} from '../vehicle/definition-document.js';
import type { ContentDelivery } from './content-manifest.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** Image syntax and set-wide invariants are admitted once, before vehicle references. */
export async function loadVehicleSpriteLibrary(content: ContentDelivery): Promise<SpriteAssets> {
  const file = content.manifest.files.find((file) => file.kind === 'image' && file.id === 'vehicles');
  if (!file) throw new RangeError('Manifest requires the vehicle sprite library');
  const value = await content.json('image', 'vehicles');
  const result = admit(file.path, () => readSpriteAssets(value));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}

const requireFileName = (id: string, file: DocumentSource) =>
  requireAdmission(id === file.id, 'invalid_value', '/id', `Expected the file name ${file.id} as the document ID`);

/**
 * Admit the catalog from its sources, from the build's files or delivery's manifest alike: exactly one
 * driving definition, named `default`, and at least one vehicle document against an admitted sprite
 * library. Each document ID is its file name and selection orders are unique.
 */
export function compileVehicleDefinitions(
  sprites: SpriteAssets,
  drivingSources: readonly DocumentSource[],
  vehicleSources: readonly DocumentSource[],
): AdmissionResult<VehicleDefinitions> {
  const single = admitSingleDocument(drivingSources, 'default', 'driving definition');
  if (!single.ok) return single;
  const driving = compileDrivingDocument(single.value.value, single.value.path);
  if (!driving.ok) return driving;
  const drivingIdentity = admit(single.value.path, () => requireFileName(driving.value.source.id, single.value));
  if (!drivingIdentity.ok) return drivingIdentity;
  const orders = new Set<number>();
  const vehicles: CompiledVehicleDefinition[] = [];
  for (const file of vehicleSources) {
    const entry = compileVehicleDocument(file.value, file.path, sprites);
    if (!entry.ok) return entry;
    const catalogRules = admit(file.path, () => {
      requireFileName(entry.value.source.id, file);
      requireAdmission(
        !orders.has(entry.value.source.selectionOrder),
        'duplicate_id',
        '/selectionOrder',
        'Duplicate selection order',
      );
    });
    if (!catalogRules.ok) return catalogRules;
    orders.add(entry.value.source.selectionOrder);
    vehicles.push(entry.value);
  }
  const nonempty = admit('', () =>
    requireAdmission(vehicles.length > 0, 'invalid_value', '', 'Expected at least one vehicle definition'),
  );
  if (!nonempty.ok) return nonempty;
  vehicles.sort((a, b) => a.source.selectionOrder - b.source.selectionOrder);
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ vehicles: Object.freeze(vehicles), driving: driving.value }),
  });
}

/** Transport verifies every payload SHA before either admission boundary sees decoded content. */
export async function loadVehicleDefinitions(content: ContentDelivery): Promise<VehicleDefinitions> {
  const sprites = await loadVehicleSpriteLibrary(content);
  const read = async (kind: 'driving' | 'vehicle') => {
    const sources: DocumentSource[] = [];
    for (const file of content.manifest.files.filter((file) => file.kind === kind))
      sources.push({ id: file.id, path: file.path, value: await content.json(kind, file.id) });
    return sources;
  };
  const result = compileVehicleDefinitions(sprites, await read('driving'), await read('vehicle'));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}
export interface VehicleDefinitions {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
}
