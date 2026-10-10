import { admit, readDocument, type AdmissionDiagnostic } from '../../src/core/admission.js';
import { ContentLoadError, requireLoaded } from '../../src/content/content-load-error.js';
import {
  readSpriteAssets,
  readVehicleSpriteSet,
  VEHICLE_SPRITE_SET_FIELDS,
  type VehicleSpriteLibraryDocument,
} from '../../src/vehicle/vehicle-sprite-library.js';

/** One authored vehicle sprite set: `content/sprites/<set>.json`, the set named by its file. */
export const VEHICLE_SPRITE_SET_FORMAT = 'superoutride.vehicle-sprite-set';
export const VEHICLE_SPRITE_SET_VERSION = 2;

type LibrarySet = VehicleSpriteLibraryDocument['sets'][string];

/** Admit one set document by the library's own rules: its fields at the document's root. */
function readSpriteSetDocument(value: unknown, name: string): LibrarySet {
  const banked = typeof value === 'object' && value !== null && Object.hasOwn(value, 'bankDegrees');
  const fields = VEHICLE_SPRITE_SET_FIELDS.filter((field) => banked || field !== 'bankDegrees');
  const document = readDocument(
    value,
    ['format', 'version', ...fields],
    VEHICLE_SPRITE_SET_FORMAT,
    VEHICLE_SPRITE_SET_VERSION,
  );
  const set = Object.fromEntries(fields.map((field) => [field, document[field]]));
  readVehicleSpriteSet(set, name);
  return set as unknown as LibrarySet;
}

/**
 * The vehicle sprite library, assembled from the set documents in set-name order: each document is admitted on its own,
 * with its own diagnostics, and the assembled library is admitted again as delivery admits it.
 */
export function assembleVehicleSpriteLibrary(
  documents: readonly { readonly name: string; readonly document: string; readonly value: unknown }[],
  directory: string,
) {
  const sorted = [...documents].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const diagnostics: AdmissionDiagnostic<string>[] = [];
  const sets: Record<string, LibrarySet> = {};
  for (const { name, document, value } of sorted) {
    const admitted = admit(document, () => readSpriteSetDocument(value, name));
    if (admitted.ok) sets[name] = admitted.value;
    else diagnostics.push(...admitted.diagnostics);
  }
  if (diagnostics.length) throw new ContentLoadError(diagnostics);
  const library: VehicleSpriteLibraryDocument = { format: 'superoutride.vehicle-sprites', version: 5, sets };
  return { library, sprites: requireLoaded(admit(directory, () => readSpriteAssets(library))) };
}
