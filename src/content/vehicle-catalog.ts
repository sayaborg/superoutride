import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { readVehicleSpriteSetDocument, type SpriteAssets } from '../vehicle/vehicle-sprite-library.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import {
  compileDrivingDocument,
  compileVehicleListingDocument,
  compileVehicleMechanicsDocument,
  createVehicleDefinition,
  type CompiledVehicleDefinition,
} from '../vehicle/definition-document.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import type { VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';
import type { EngineSoundCatalog } from './engine-sound-catalog.js';

/**
 * The vehicle sprite sets, one delivered file each, the set named by its manifest ID; each is admitted by its own rules
 * as it is read.
 */
export async function loadVehicleSpriteSets(content: ContentDelivery): Promise<SpriteAssets> {
  const sets: Record<string, VehicleSpriteSet> = {};
  for (const { id, path, value } of await content.documents('vehicle-sprite-set'))
    sets[id] = requireLoaded(admit(path, () => readVehicleSpriteSetDocument(value, id).set));
  return Object.freeze({ sets: Object.freeze(sets) });
}

/** The single driving definition's identifier: its file name and manifest ID. */
export const DRIVING_DEFINITION_ID = 'default';

/**
 * Admit the catalog from its sources, from the build's files or delivery's manifest alike: exactly one
 * driving definition, named `default`, and at least one vehicle. A vehicle is a mechanics document and
 * a listing document with the same identifier, its file name; either one alone is rejected. Listings
 * resolve against the admitted sprite sets and engine-sound catalog, and selection orders are unique.
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
  const sprites = await loadVehicleSpriteSets(content);
  const driving = await content.documents('driving'),
    vehicles = await content.documents('vehicle'),
    listings = await content.documents('vehicle-listing');
  return requireLoaded(compileVehicleDefinitions(sprites, sounds, driving, vehicles, listings));
}
export interface VehicleDefinitions {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
}
