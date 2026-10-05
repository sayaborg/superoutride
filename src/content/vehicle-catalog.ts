import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { readSpriteAssets, type SpriteAssets } from '../vehicle/vehicle-sprite-library.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import {
  compileDrivingDocument,
  compileVehicleListingDocument,
  compileVehicleMechanicsDocument,
  createVehicleDefinition,
  type CompiledVehicleDefinition,
} from '../vehicle/definition-document.js';
import type { ContentDelivery } from './content-delivery.js';
import { missingContent, requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';
import type { EngineSoundCatalog } from './engine-sound-catalog.js';

/** Image syntax and set-wide invariants are admitted once, before vehicle references. */
export async function loadVehicleSpriteLibrary(content: ContentDelivery): Promise<SpriteAssets> {
  const file = content.manifest.files.find((file) => file.kind === 'image' && file.id === 'vehicles');
  if (!file) throw missingContent('image', 'vehicles');
  const value = await content.json('image', 'vehicles');
  return requireLoaded(admit(file.path, () => readSpriteAssets(value)));
}

/** The single driving definition's identifier: its file name and manifest ID. */
export const DRIVING_DEFINITION_ID = 'default';

/**
 * Admit the catalog from its sources, from the build's files or delivery's manifest alike: exactly one
 * driving definition, named `default`, and at least one vehicle. A vehicle is a mechanics document and
 * a listing document with the same identifier, its file name; either one alone is rejected. Listings
 * resolve against an admitted sprite library and engine-sound catalog, and selection orders are unique.
 */
export function compileVehicleDefinitions(
  sprites: SpriteAssets,
  sounds: EngineSoundCatalog,
  drivingSources: readonly DocumentSource[],
  mechanicsSources: readonly DocumentSource[],
  listingSources: readonly DocumentSource[],
): AdmissionResult<VehicleDefinitions> {
  const single = admitSingleDocument(drivingSources, DRIVING_DEFINITION_ID, 'driving definition');
  if (!single.ok) return single;
  const driving = compileDrivingDocument(single.value.value, single.value.path, single.value.sha256);
  if (!driving.ok) return driving;
  const orders = new Set<number>();
  const vehicles: CompiledVehicleDefinition[] = [];
  for (const file of mechanicsSources) {
    const mechanics = compileVehicleMechanicsDocument(file.value, file.id, file.path, file.sha256);
    if (!mechanics.ok) return mechanics;
    const listingFile = listingSources.find((source) => source.id === file.id);
    const paired = admit(file.path, () =>
      requireAdmission(!!listingFile, 'unresolved_reference', '', `Expected the vehicle listing ${file.id}`),
    );
    if (!paired.ok) return paired;
    const listing = compileVehicleListingDocument(listingFile!.value, listingFile!.path, sprites, sounds);
    if (!listing.ok) return listing;
    const catalogRules = admit(listingFile!.path, () =>
      requireAdmission(
        !orders.has(listing.value.source.selectionOrder),
        'duplicate_id',
        '/selectionOrder',
        'Duplicate selection order',
      ),
    );
    if (!catalogRules.ok) return catalogRules;
    orders.add(listing.value.source.selectionOrder);
    vehicles.push(createVehicleDefinition(mechanics.value, listing.value));
  }
  const unpaired = listingSources.find((listing) => !mechanicsSources.some((source) => source.id === listing.id));
  const listed = admit(unpaired?.path ?? '', () =>
    requireAdmission(!unpaired, 'unresolved_reference', '', `Expected the vehicle mechanics ${unpaired?.id}`),
  );
  if (!listed.ok) return listed;
  const nonempty = admit('', () =>
    requireAdmission(vehicles.length > 0, 'invalid_value', '', 'Expected at least one vehicle definition'),
  );
  if (!nonempty.ok) return nonempty;
  vehicles.sort((a, b) => a.listing.selectionOrder - b.listing.selectionOrder);
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ vehicles: Object.freeze(vehicles), driving: driving.value }),
  });
}

/** Transport verifies every payload SHA before either admission boundary sees decoded content. */
export async function loadVehicleDefinitions(
  content: ContentDelivery,
  sounds: EngineSoundCatalog,
): Promise<VehicleDefinitions> {
  const sprites = await loadVehicleSpriteLibrary(content);
  const read = async (kind: 'driving' | 'vehicle' | 'vehicle-listing') => {
    const sources: DocumentSource[] = [];
    for (const file of content.manifest.files.filter((file) => file.kind === kind))
      sources.push({ id: file.id, path: file.path, value: await content.json(kind, file.id), sha256: file.sha256 });
    return sources;
  };
  return requireLoaded(
    compileVehicleDefinitions(
      sprites,
      sounds,
      await read('driving'),
      await read('vehicle'),
      await read('vehicle-listing'),
    ),
  );
}
export interface VehicleDefinitions {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
}
