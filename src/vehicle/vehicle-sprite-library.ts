import {
  deepFreeze,
  readArray,
  readDictionary,
  readDocument,
  readEmbedded,
  readNumber,
  readRecord,
  requireAdmission,
} from '../core/admission.js';
import { readRgb555 } from '../image/rgb555.js';
import { readSpriteLodAsset, spriteLodLayout, type SpriteAsset, type SpriteLodDocument } from '../image/sprite.js';
import type { VehicleSpriteSet } from './vehicle-sprite-set.js';

export interface SpriteAssets {
  readonly sets: Readonly<Record<string, VehicleSpriteSet>>;
}

type BrakeLamp = VehicleSpriteSet['brakeLamp'];

/** The vehicle sprite library document: indexed sprite images and the sets that bind them by index. */
export interface VehicleSpriteLibraryDocument {
  readonly format: 'superoutride.vehicle-sprites';
  readonly version: 4;
  readonly sprites: readonly SpriteLodDocument[];
  readonly sets: Readonly<
    Record<
      string,
      {
        readonly yawVariants: number;
        readonly bankVariants: number;
        /** Present exactly when the set has more than one bank image. */
        readonly bankDegrees?: number;
        readonly assets: readonly (readonly number[])[];
        readonly brakeLamp: BrakeLamp;
      }
    >
  >;
}

/**
 * Admission of the vehicle sprite library. The build admits its normalized masters; delivery admits
 * the completed library, whose images carry the complete build-generated pyramid. Besides the sets,
 * it publishes the admitted document and, by image index, the brake-lamp colors of the image's set.
 */
export function readVehicleSpriteLibrary(value: unknown, completePyramids = true) {
  const library = readDocument(value, ['format', 'version', 'sprites', 'sets'], 'superoutride.vehicle-sprites', 4);
  const spriteDocuments = readArray(library.sprites, '/sprites', (value) => value);
  const sprites = new Map<number, { asset: SpriteAsset; set: string; off: number; on: number }>();
  const setDocuments: Record<string, VehicleSpriteLibraryDocument['sets'][string]> = {};
  const set = (value: unknown, path: string, name: string): VehicleSpriteSet => {
    const banked = typeof value === 'object' && value !== null && Object.hasOwn(value, 'bankDegrees');
    const recordData = readRecord(value, path, [
      'yawVariants',
      'bankVariants',
      ...(banked ? ['bankDegrees'] : []),
      'assets',
      'brakeLamp',
    ]);
    const lamp = readRecord(recordData.brakeLamp, `${path}/brakeLamp`, ['off', 'on']);
    const brakeLamp = Object.freeze({
      off: readRgb555(lamp.off, `${path}/brakeLamp/off`),
      on: readRgb555(lamp.on, `${path}/brakeLamp/on`),
    });
    const count = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
    const yawVariants = readNumber(recordData.yawVariants, `${path}/yawVariants`, count);
    const bankVariants = readNumber(recordData.bankVariants, `${path}/bankVariants`, count);
    requireAdmission(
      banked === bankVariants > 1,
      'invalid_shape',
      `${path}/bankDegrees`,
      'A set declares bankDegrees exactly when it has more than one bank image',
    );
    const bankDegrees = banked
      ? readNumber(recordData.bankDegrees, `${path}/bankDegrees`, { min: 0, max: 90, exclusiveMin: true })
      : null;
    const indices: number[][] = [];
    const assets = readArray(
      recordData.assets,
      `${path}/assets`,
      (row, rowPath) => {
        const rowIndices: number[] = [];
        indices.push(rowIndices);
        return readArray(
          row,
          rowPath,
          (value, at) => {
            const id = readNumber(value, at, { min: 0, max: spriteDocuments.length - 1, integer: true });
            rowIndices.push(id);
            let admitted = sprites.get(id);
            if (!admitted) {
              const image = `/sprites/${id}`;
              const asset = readEmbedded(image, () => readSpriteLodAsset(spriteDocuments[id], [brakeLamp.off]));
              requireAdmission(
                !completePyramids || asset.levels.length === spriteLodLayout(asset.width, asset.height).length,
                'invalid_value',
                `${image}/levels`,
                'Shipped sprites require the complete build-generated pyramid',
              );
              admitted = { asset, set: name, ...brakeLamp };
              sprites.set(id, admitted);
            }
            requireAdmission(admitted.set === name, 'invalid_value', at, 'A vehicle image belongs to one sprite set');
            return admitted.asset;
          },
          { length: bankVariants },
        );
      },
      { length: yawVariants },
    );
    const names = Object.keys(assets[0]![0]!.palettes).sort();
    requireAdmission(
      names.length >= 2,
      'invalid_value',
      `${path}/assets`,
      'Vehicle sprite set requires at least two named colors',
    );
    requireAdmission(
      assets.flat().every((image) => JSON.stringify(Object.keys(image.palettes).sort()) === JSON.stringify(names)),
      'invalid_value',
      `${path}/assets`,
      'Every image in a vehicle set must declare the same color names',
    );
    setDocuments[name] = deepFreeze({
      yawVariants,
      bankVariants,
      ...(bankDegrees === null ? {} : { bankDegrees }),
      assets: indices,
      brakeLamp,
    });
    return Object.freeze({ brakeLamp, yawVariants, bankVariants, bankDegrees, assets });
  };
  const sets = readDictionary(library.sets, '/sets', set);
  const unbound = spriteDocuments.findIndex((_, id) => !sprites.has(id));
  requireAdmission(unbound < 0, 'invalid_value', `/sprites/${unbound}`, 'Vehicle image must belong to a sprite set');
  const document: VehicleSpriteLibraryDocument = Object.freeze({
    format: 'superoutride.vehicle-sprites',
    version: 4,
    // Each image passed sprite-LOD admission above, which establishes its document shape.
    sprites: Object.freeze(spriteDocuments.map((image) => deepFreeze(image as SpriteLodDocument))),
    sets: Object.freeze(setDocuments),
  });
  const brakeLamps: readonly BrakeLamp[] = Object.freeze(
    spriteDocuments.map((_, id) => Object.freeze({ off: sprites.get(id)!.off, on: sprites.get(id)!.on })),
  );
  const assets: SpriteAssets = Object.freeze({ sets });
  return Object.freeze({ assets, document, brakeLamps });
}

/** Delivery admission of the completed vehicle sprite library. */
export function readSpriteAssets(value: unknown): SpriteAssets {
  return readVehicleSpriteLibrary(value).assets;
}
