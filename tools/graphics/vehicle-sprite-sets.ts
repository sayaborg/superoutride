import { AdmissionError, admit, readDocument, type AdmissionDiagnostic } from '../../src/core/admission.js';
import { ContentLoadError } from '../../src/content/content-load-error.js';
import {
  readVehicleSpriteLibrary,
  type VehicleSpriteLibraryDocument,
} from '../../src/vehicle/vehicle-sprite-library.js';

/** One authored vehicle sprite set: `content/sprites/<set>.json`, the set named by its file. */
export const VEHICLE_SPRITE_SET_FORMAT = 'superoutride.vehicle-sprite-set';
export const VEHICLE_SPRITE_SET_VERSION = 1;

type LibrarySet = VehicleSpriteLibraryDocument['sets'][string];

/** A set document's admitted parts: its images and its binding of them by index within the document. */
interface AdmittedSet {
  readonly sprites: readonly unknown[];
  readonly set: Omit<LibrarySet, 'assets'> & { readonly assets: readonly (readonly number[])[] };
}

/**
 * Admit one set document by the library's own rules, as a library holding only this set: its images at `/sprites`
 * and its fields at the document's root.
 */
function readSpriteSetDocument(value: unknown, name: string): AdmittedSet {
  const banked = typeof value === 'object' && value !== null && Object.hasOwn(value, 'bankDegrees');
  const fields = ['yawVariants', 'bankVariants', ...(banked ? ['bankDegrees'] : []), 'brakeLamp', 'assets'];
  const document = readDocument(
    value,
    ['format', 'version', ...fields, 'sprites'],
    VEHICLE_SPRITE_SET_FORMAT,
    VEHICLE_SPRITE_SET_VERSION,
  );
  const set = Object.fromEntries(fields.map((field) => [field, document[field]]));
  const base = `/sets/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
  try {
    readVehicleSpriteLibrary(
      { format: 'superoutride.vehicle-sprites', version: 4, sprites: document.sprites, sets: { [name]: set } },
      false,
    );
  } catch (error) {
    if (!(error instanceof AdmissionError) || !error.path.startsWith(base)) throw error;
    throw new AdmissionError(error.code, error.path.slice(base.length), error.message);
  }
  return { sprites: document.sprites as readonly unknown[], set: set as unknown as AdmittedSet['set'] };
}

/**
 * The vehicle sprite library's masters, assembled from the set documents: in set-name order, each set's images follow
 * the earlier sets' and its bindings index them from there. Each document is admitted on its own, with its own
 * diagnostics; the library compiler admits the assembled masters again.
 */
export function assembleVehicleSpriteLibrary(
  documents: readonly { readonly name: string; readonly document: string; readonly value: unknown }[],
): VehicleSpriteLibraryDocument {
  const sorted = [...documents].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const diagnostics: AdmissionDiagnostic<string>[] = [];
  const sprites: unknown[] = [];
  const sets: Record<string, LibrarySet> = {};
  for (const { name, document, value } of sorted) {
    const admitted = admit(document, () => readSpriteSetDocument(value, name));
    if (!admitted.ok) {
      diagnostics.push(...admitted.diagnostics);
      continue;
    }
    const base = sprites.length;
    sprites.push(...admitted.value.sprites);
    const { assets, ...set } = admitted.value.set;
    sets[name] = { ...set, assets: assets.map((row) => row.map((index) => base + index)) };
  }
  if (diagnostics.length) throw new ContentLoadError(diagnostics);
  return {
    format: 'superoutride.vehicle-sprites',
    version: 4,
    sprites,
    sets,
  } as unknown as VehicleSpriteLibraryDocument;
}
