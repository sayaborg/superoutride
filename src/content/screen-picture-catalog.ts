import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { compileTilePicture, type TilePicture } from '../image/tile-picture.js';
import type { ContentDelivery } from './content-delivery.js';
import { UNSLICED, type WorkSlices } from '../core/work-slices.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';

/** The directory under `content/` that holds the screen pictures, one tile picture document each. */
export const SCREEN_PICTURES_DIRECTORY = 'screen-pictures';

/** The title logo: 36×14 tiles (288×112 px), which may be transparent. */
export const TITLE_LOGO = Object.freeze({ id: 'title-logo', columns: 36, rows: 14 });

/** The picture of the controls, which LOADING stands on: 40×30 tiles, the whole 320×240 frame. */
export const CONTROLS_PICTURE = Object.freeze({ id: 'controls', columns: 40, rows: 30 });

/** A series image: 40×30 tiles, the whole 320×240 frame, and opaque. */
export const SERIES_IMAGE = Object.freeze({ columns: 40, rows: 30 });

/** The admitted screen pictures by name. */
export type ScreenPictureCatalog = ReadonlyMap<string, TilePicture>;

/** Admit one screen picture: a tile picture named by its file name, the title logo at its size. */
function admitScreenPicture(source: DocumentSource): AdmissionResult<TilePicture> {
  return admit(source.path, () => {
    const picture = compileTilePicture(source.value);
    requireAdmission(
      picture.name === source.id,
      'invalid_value',
      '/name',
      `A screen picture is named by its file ${source.id}`,
    );
    if (source.id === TITLE_LOGO.id)
      requireAdmission(
        picture.columns === TITLE_LOGO.columns && picture.rows === TITLE_LOGO.rows,
        'invalid_value',
        '/columns',
        `The title logo is ${TITLE_LOGO.columns}×${TITLE_LOGO.rows} tiles`,
      );
    if (source.id === CONTROLS_PICTURE.id)
      requireAdmission(
        picture.columns === CONTROLS_PICTURE.columns && picture.rows === CONTROLS_PICTURE.rows,
        'invalid_value',
        '/columns',
        `The picture of the controls is ${CONTROLS_PICTURE.columns}×${CONTROLS_PICTURE.rows} tiles`,
      );
    return picture;
  });
}

/** The catalog of the admitted pictures: the title logo is among them. */
function screenPictureCatalog(pictures: Map<string, TilePicture>): AdmissionResult<ScreenPictureCatalog> {
  return admit(`content/${SCREEN_PICTURES_DIRECTORY}/`, () => {
    requireAdmission(pictures.has(TITLE_LOGO.id), 'unresolved_reference', '', `Missing ${TITLE_LOGO.id}`);
    return pictures as ScreenPictureCatalog;
  });
}

/**
 * Admit the screen pictures: each document is a tile picture named by its file name, and the title logo is among them
 * at its size. A series admits its own image's size and opacity.
 */
export function compileScreenPictures(sources: readonly DocumentSource[]): AdmissionResult<ScreenPictureCatalog> {
  const pictures = new Map<string, TilePicture>();
  for (const source of sources) {
    const admitted = admitScreenPicture(source);
    if (!admitted.ok) return admitted;
    pictures.set(source.id, admitted.value);
  }
  return screenPictureCatalog(pictures);
}

/**
 * The delivered screen pictures, admitted again as other delivered documents are, as `compileScreenPictures` admits
 * them; with `slices`, each picture's decoding and admission are units of their own.
 */
export async function loadScreenPictures(
  content: ContentDelivery,
  slices: WorkSlices = UNSLICED,
): Promise<ScreenPictureCatalog> {
  const pictures = new Map<string, TilePicture>();
  for (const source of await content.documents('screen-picture', slices)) {
    if (slices.due()) await slices.pause();
    pictures.set(source.id, requireLoaded(admitScreenPicture(source)));
  }
  return requireLoaded(screenPictureCatalog(pictures));
}

/** The delivered screen picture `id` alone, admitted as the catalog admits it, or null when none is delivered. */
export async function loadScreenPicture(content: ContentDelivery, id: string): Promise<TilePicture | null> {
  const entry = content.manifest.files.find((file) => file.kind === 'screen-picture' && file.id === id);
  if (!entry) return null;
  const value = await content.json('screen-picture', id);
  return requireLoaded(admitScreenPicture({ id, path: entry.path, value, sha256: entry.sha256 }));
}
