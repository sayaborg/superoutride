import { readArray, readDocument, readNumber, readRecord, readString, requireAdmission } from '../core/admission.js';
import {
  createSpritePalette,
  readSpritePalettes,
  readSpritePicture,
  type SpriteLodAsset,
  type SpriteLodDocument,
  type SpritePalette,
} from './sprite.js';

export const SPRITE_VIEWS_FORMAT = 'superoutride.sprite-views';
/** A view set's views: 32 through half a turn of the angle between its board's road and the line of sight. */
export const SPRITE_VIEW_COUNT = 32;

/** One picture of a view set: a course image's picture, without a shadow. */
export type SpriteViewsPictureDocument = Pick<SpriteLodDocument, 'width' | 'height' | 'anchorX' | 'anchorY' | 'levels'>;

export interface SpriteViewsDocument {
  readonly format: typeof SPRITE_VIEWS_FORMAT;
  readonly version: 1;
  readonly name: string;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly pictures: readonly SpriteViewsPictureDocument[];
  readonly views: readonly number[];
}

/**
 * A view set ([Image assets](../../docs/image-assets.md#view-sets)): its distinct pictures, each a course image of the
 * set's name and palettes, and the picture of each of its 32 views.
 */
export interface SpriteViewsAsset {
  readonly name: string;
  readonly defaultPalette: string;
  readonly palettes: Readonly<Record<string, SpritePalette>>;
  readonly pictures: readonly SpriteLodAsset[];
  readonly views: readonly number[];
}

/** View-set admission: every picture as a course image's, every view a picture, every picture some view's. */
export function readSpriteViewsAsset(value: unknown): SpriteViewsAsset {
  const document = readDocument(
    value,
    ['format', 'version', 'name', 'defaultPalette', 'palettes', 'pictures', 'views'],
    SPRITE_VIEWS_FORMAT,
    1,
  );
  const name = readString(document.name, '/name');
  const { palettes, defaultPalette } = readSpritePalettes(document);
  const pictures = readArray(
    document.pictures,
    '/pictures',
    (picture, path) =>
      Object.freeze({
        name,
        ...readSpritePicture(
          readRecord(picture, path, ['width', 'height', 'anchorX', 'anchorY', 'levels']),
          path,
          palettes,
          defaultPalette,
          () => null,
        ),
        defaultPalette,
        palettes,
      }),
    { min: 1, max: SPRITE_VIEW_COUNT },
  );
  const views = readArray(
    document.views,
    '/views',
    (view, path) => readNumber(view, path, { min: 0, max: pictures.length - 1, integer: true }),
    { length: SPRITE_VIEW_COUNT },
  );
  pictures.forEach((_, p) =>
    requireAdmission(views.includes(p), 'invalid_value', `/pictures/${p}`, "Every picture is some view's"),
  );
  return Object.freeze({
    name,
    defaultPalette,
    palettes,
    pictures: Object.freeze(pictures),
    views: Object.freeze(views),
  });
}

/** A view set in one of its named colors: every picture's levels evaluated in it once before drawing. */
export function createSpriteViewsPalette(asset: SpriteViewsAsset, name: string): SpriteViewsAsset {
  return Object.freeze({
    ...asset,
    pictures: Object.freeze(asset.pictures.map((picture) => createSpritePalette(picture, name))),
  });
}
