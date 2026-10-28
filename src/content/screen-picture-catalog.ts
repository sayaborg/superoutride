import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { compileTilePicture, type TilePicture } from '../image/tile-picture.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';

/** The directory under `content/` that holds the screen pictures, one tile picture document each. */
export const SCREEN_PICTURES_DIRECTORY = 'screen-pictures';

/** The title logo: 36×14 tiles (288×112 px), which may be transparent. */
export const TITLE_LOGO = Object.freeze({ id: 'title-logo', columns: 36, rows: 14 });

/** A series image: 40×30 tiles, the whole 320×240 frame, and opaque. */
export const SERIES_IMAGE = Object.freeze({ columns: 40, rows: 30 });

/** The admitted screen pictures by name. */
export type ScreenPictureCatalog = ReadonlyMap<string, TilePicture>;

/**
 * Admit the screen pictures: each document is a tile picture named by its file name, and the title logo is among them
 * at its size. A series admits its own image's size and opacity.
 */
export function compileScreenPictures(sources: readonly DocumentSource[]): AdmissionResult<ScreenPictureCatalog> {
  const pictures = new Map<string, TilePicture>();
  for (const source of sources) {
    const admitted = admit(source.path, () => {
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
      return picture;
    });
    if (!admitted.ok) return admitted;
    pictures.set(source.id, admitted.value);
  }
  return admit(`content/${SCREEN_PICTURES_DIRECTORY}/`, () => {
    requireAdmission(pictures.has(TITLE_LOGO.id), 'unresolved_reference', '', `Missing ${TITLE_LOGO.id}`);
    return pictures as ScreenPictureCatalog;
  });
}

/** The delivered screen pictures, admitted again as other delivered documents are. */
export async function loadScreenPictures(content: ContentDelivery): Promise<ScreenPictureCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'screen-picture'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('screen-picture', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileScreenPictures(sources));
}
