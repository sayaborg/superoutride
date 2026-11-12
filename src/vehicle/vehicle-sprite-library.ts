import {
  deepFreeze,
  readArray,
  readArraySteps,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  requireAdmission,
  throughSteps,
} from '../core/admission.js';
import { readRgb555 } from '../image/rgb555.js';
import { IndexedPattern } from '../image/indexed-image.js';
import type { SpriteFrame } from '../image/sprite.js';
import type { VehiclePicture, VehiclePictureSize, VehicleSpriteSet } from './vehicle-sprite-set.js';

/**
 * The sizes every vehicle picture has: size `k` from 0 (full size) to 5, the size the farthest rendered depth selects
 * ([Image assets](../../docs/image-assets.md#picture-contract)).
 */
export const VEHICLE_PICTURE_SIZES = 6;

/** The number of colors every vehicle sprite set declares ([Image assets](../../docs/image-assets.md#vehicle-sprite-sets)). */
export const VEHICLE_COLORS = 4;

/** The admitted vehicle sprite sets by name; each set was admitted by its own rules, and none refers to another. */
export interface SpriteAssets {
  readonly sets: Readonly<Record<string, VehicleSpriteSet>>;
}

/** One frame as saved: its extent, its anchor and its rows, top first, one hexadecimal digit (`0`–`f`) per index. */
interface FrameDocument {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly rows: readonly string[];
}

/**
 * One vehicle sprite set as saved: its grid of picture indices, its palettes by color name (slots 1–14), its brake
 * lamp's off and on colors (slot 15) and its pictures.
 */
export interface VehicleSpriteSetDocument {
  readonly yawVariants: number;
  readonly bankVariants: number;
  /** Present exactly when the set has more than one bank image. */
  readonly bankDegrees?: number;
  readonly palettes: Readonly<Record<string, readonly number[]>>;
  readonly brakeLamp: { readonly off: number; readonly on: number };
  readonly assets: readonly (readonly number[])[];
  readonly pictures: readonly {
    readonly sizes: readonly (FrameDocument & { readonly shadow: FrameDocument })[];
  }[];
}

/** One vehicle sprite set's saved format: `content/sprites/<set>.json`, delivered as authored, the set named by its file. */
export const VEHICLE_SPRITE_SET_FORMAT = 'superoutride.vehicle-sprite-set';
export const VEHICLE_SPRITE_SET_VERSION = 3;

/** The fields of a set, at its document's root after the format and version. */
export const VEHICLE_SPRITE_SET_FIELDS = [
  'yawVariants',
  'bankVariants',
  'bankDegrees',
  'palettes',
  'brakeLamp',
  'assets',
  'pictures',
] as const;

const EXTENT = { min: 1, max: 1 << 16, integer: true };

const ROW = /^[0-9a-f]*$/;

/** A frame of `extra` fields besides its own, with its rows as a pattern. */
function readFrame(value: unknown, path: string, extra: readonly string[] = []) {
  const frame = readRecord(value, path, ['width', 'height', 'anchorX', 'anchorY', 'rows', ...extra]);
  const width = readNumber(frame.width, `${path}/width`, EXTENT);
  const height = readNumber(frame.height, `${path}/height`, EXTENT);
  const rows = readArray(
    frame.rows,
    `${path}/rows`,
    (row, at) => {
      requireAdmission(
        typeof row === 'string' && row.length === width && ROW.test(row),
        'invalid_value',
        at,
        `Expected ${width} hexadecimal digits`,
      );
      return row as string;
    },
    { length: height },
  );
  const indices: number[] = [];
  for (const row of rows)
    for (let x = 0; x < width; x++) {
      const code = row.charCodeAt(x);
      // `0`–`9` and `a`–`f`, which the row's admission established.
      indices.push(code <= 57 ? code - 48 : code - 87);
    }
  const read: SpriteFrame = Object.freeze({
    width,
    height,
    anchorX: readNumber(frame.anchorX, `${path}/anchorX`),
    anchorY: readNumber(frame.anchorY, `${path}/anchorY`),
    pattern: new IndexedPattern(width, height, indices),
  });
  return { frame, read };
}

/**
 * Admit one vehicle sprite set, its pointers relative to the set: exactly four named palettes of slots 1–14 and the
 * brake lamp's off and on colors; its grid binds every one of its pictures; each picture has every size, each size its
 * picture and its shadow on the same texel grid (the anchors differ by whole texels).
 */
export function readVehicleSpriteSet(value: unknown, name: string): VehicleSpriteSet {
  return throughSteps(vehicleSpriteSetSteps(value, name));
}

/** `readVehicleSpriteSet` in steps, one a picture. */
function* vehicleSpriteSetSteps(value: unknown, name: string): Generator<void, VehicleSpriteSet> {
  const banked = typeof value === 'object' && value !== null && Object.hasOwn(value, 'bankDegrees');
  const set = readRecord(
    value,
    '',
    VEHICLE_SPRITE_SET_FIELDS.filter((field) => banked || field !== 'bankDegrees'),
  );
  const count = { min: 1, max: 1 << 10, integer: true };
  const yawVariants = readNumber(set.yawVariants, '/yawVariants', count);
  const bankVariants = readNumber(set.bankVariants, '/bankVariants', count);
  requireAdmission(
    banked === bankVariants > 1,
    'invalid_shape',
    '/bankDegrees',
    'A set declares bankDegrees exactly when it has more than one bank image',
  );
  const bankDegrees = banked
    ? readNumber(set.bankDegrees, '/bankDegrees', { min: 0, max: 90, exclusiveMin: true })
    : null;
  const palettes = readDictionary(set.palettes, '/palettes', (value, path) =>
    Object.freeze(readArray(value, path, readRgb555, { length: 14 })),
  );
  const colors = Object.freeze(Object.keys(palettes));
  requireAdmission(
    colors.length === VEHICLE_COLORS,
    'invalid_value',
    '/palettes',
    `A set declares exactly ${VEHICLE_COLORS} colors`,
  );
  const lamp = readRecord(set.brakeLamp, '/brakeLamp', ['off', 'on']);
  const brakeLamp = Object.freeze({
    off: readRgb555(lamp.off, '/brakeLamp/off'),
    on: readRgb555(lamp.on, '/brakeLamp/on'),
  });
  const pictures = yield* readArraySteps(
    set.pictures,
    '/pictures',
    (value, path): VehiclePicture => {
      const sizes = readArray(
        readRecord(value, path, ['sizes']).sizes,
        `${path}/sizes`,
        (value, at): VehiclePictureSize => {
          const { frame, read } = readFrame(value, at, ['shadow']);
          const shadow = readFrame(frame.shadow, `${at}/shadow`).read;
          requireAdmission(
            Number.isInteger(read.anchorX - shadow.anchorX) && Number.isInteger(read.anchorY - shadow.anchorY),
            'invalid_value',
            `${at}/shadow`,
            'A shadow lies on its picture texel grid: their anchors differ by whole texels',
          );
          return Object.freeze({ ...read, shadow });
        },
        { length: VEHICLE_PICTURE_SIZES },
      );
      return Object.freeze({ name: `${name} ${path.slice('/pictures/'.length)}`, sizes });
    },
    { min: 1 },
  );
  const bound = new Set<number>();
  const grid = readArray(
    set.assets,
    '/assets',
    (row, rowPath) =>
      readArray(
        row,
        rowPath,
        (value, at) => {
          const index = readNumber(value, at, { min: 0, max: pictures.length - 1, integer: true });
          bound.add(index);
          return pictures[index]!;
        },
        { length: bankVariants },
      ),
    { length: yawVariants },
  );
  const unbound = pictures.findIndex((_, index) => !bound.has(index));
  requireAdmission(unbound < 0, 'invalid_value', `/pictures/${unbound}`, 'Every picture fills a cell of the grid');
  return Object.freeze({ yawVariants, bankVariants, bankDegrees, colors, palettes, brakeLamp, pictures: grid });
}

/**
 * Admit one vehicle sprite set document, as authored and as delivered: its format and version, then its set by
 * `readVehicleSpriteSet`. Besides the set, it publishes the admitted document's set fields.
 */
export function readVehicleSpriteSetDocument(value: unknown, name: string) {
  return throughSteps(vehicleSpriteSetDocumentSteps(value, name));
}

/** `readVehicleSpriteSetDocument` in steps, one a picture, for admission sliced between them (`admitInSlices`). */
export function* vehicleSpriteSetDocumentSteps(value: unknown, name: string) {
  const banked = typeof value === 'object' && value !== null && Object.hasOwn(value, 'bankDegrees');
  const fields = VEHICLE_SPRITE_SET_FIELDS.filter((field) => banked || field !== 'bankDegrees');
  const document = readDocument(
    value,
    ['format', 'version', ...fields],
    VEHICLE_SPRITE_SET_FORMAT,
    VEHICLE_SPRITE_SET_VERSION,
  );
  const fieldValues = Object.fromEntries(fields.map((field) => [field, document[field]]));
  const set = yield* vehicleSpriteSetSteps(fieldValues, name);
  // The set passed its admission above, which establishes its document's shape.
  return Object.freeze({ set, document: deepFreeze(fieldValues as unknown as VehicleSpriteSetDocument) });
}
