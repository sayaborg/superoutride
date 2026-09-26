import {
  deepFreeze,
  readArray,
  readDictionary,
  readDocument,
  readEmbedded,
  readNumber,
  readRecord,
  readRgb555,
  requireAdmission,
} from '../core/admission.js';
import { clamp, wrapAngle } from '../core/math.js';
import {
  createSpritePalette,
  readSpriteLodAsset,
  spriteLodLayout,
  type SpriteAsset,
  type SpriteLodDocument,
} from './sprite.js';

export interface VehicleSpriteSet {
  readonly brakeLamp: Readonly<{ off: number; on: number }>;
  readonly yawVariants: number;
  readonly bankVariants: number;
  readonly assets: readonly (readonly SpriteAsset[])[];
}
export interface SpriteAssets {
  readonly sets: Readonly<Record<string, VehicleSpriteSet>>;
}

type BrakeLamp = VehicleSpriteSet['brakeLamp'];

/** The vehicle sprite library document: indexed sprite images and the sets that bind them by index. */
export interface VehicleSpriteLibraryDocument {
  readonly format: 'superoutride.vehicle-sprites';
  readonly version: 3;
  readonly sprites: readonly SpriteLodDocument[];
  readonly sets: Readonly<
    Record<
      string,
      {
        readonly yawVariants: number;
        readonly bankVariants: number;
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
  const library = readDocument(value, ['format', 'version', 'sprites', 'sets'], 'superoutride.vehicle-sprites', 3);
  const spriteDocuments = readArray(library.sprites, '/sprites', (value) => value);
  const sprites = new Map<number, { asset: SpriteAsset; off: number; on: number }>();
  const setDocuments: Record<string, VehicleSpriteLibraryDocument['sets'][string]> = {};
  const set = (value: unknown, path: string, name: string): VehicleSpriteSet => {
    const recordData = readRecord(value, path, ['yawVariants', 'bankVariants', 'assets', 'brakeLamp']);
    const lamp = readRecord(recordData.brakeLamp, `${path}/brakeLamp`, ['off', 'on']);
    const brakeLamp = Object.freeze({
      off: readRgb555(lamp.off, `${path}/brakeLamp/off`),
      on: readRgb555(lamp.on, `${path}/brakeLamp/on`),
    });
    const count = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
    const yawVariants = readNumber(recordData.yawVariants, `${path}/yawVariants`, count);
    const bankVariants = readNumber(recordData.bankVariants, `${path}/bankVariants`, count);
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
              admitted = { asset, ...brakeLamp };
              sprites.set(id, admitted);
            }
            requireAdmission(
              admitted.off === brakeLamp.off && admitted.on === brakeLamp.on,
              'invalid_value',
              `${path}/brakeLamp`,
              'Shared vehicle images require the same set brake-lamp colors',
            );
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
    setDocuments[name] = deepFreeze({ yawVariants, bankVariants, assets: indices, brakeLamp });
    return Object.freeze({ brakeLamp, yawVariants, bankVariants, assets });
  };
  const sets = readDictionary(library.sets, '/sets', set);
  const unbound = spriteDocuments.findIndex((_, id) => !sprites.has(id));
  requireAdmission(unbound < 0, 'invalid_value', `/sprites/${unbound}`, 'Vehicle image must belong to a sprite set');
  const document: VehicleSpriteLibraryDocument = Object.freeze({
    format: 'superoutride.vehicle-sprites',
    version: 3,
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

/** An instance resolves each image's own named color and lamp state once. */
export function createVehiclePaletteVariant(
  set: VehicleSpriteSet,
  palette: string,
  brakeLampOn = false,
): VehicleSpriteSet {
  const images = new Map<SpriteAsset, SpriteAsset>();
  const assets = set.assets.map((row) =>
    Object.freeze(
      row.map((asset) => {
        let variant = images.get(asset);
        if (!variant) {
          variant = createSpritePalette(asset, palette, [brakeLampOn ? set.brakeLamp.on : set.brakeLamp.off]);
          images.set(asset, variant);
        }
        return variant;
      }),
    ),
  );
  return Object.freeze({ ...set, assets: Object.freeze(assets) });
}

function selectYawVariant(relativeYaw: number, count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('yaw variant count must be >= 1');
  const angle = wrapAngle(relativeYaw);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return Math.round((normalized / (Math.PI * 2)) * count) % count;
}

function selectBankVariant(bank: number, count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('bank variant count must be >= 1');
  if (count === 1) return 0;
  const t = (clamp(bank, -1, 1) + 1) * 0.5;
  return Math.round(t * (count - 1));
}

export function selectVehicleSprite(
  set: VehicleSpriteSet,
  relativeYaw: number,
  normalizedBank = 0,
): { asset: SpriteAsset; yawIndex: number; bankIndex: number } {
  const yawIndex = selectYawVariant(relativeYaw, set.yawVariants);
  const bankIndex = selectBankVariant(normalizedBank, set.bankVariants);
  return {
    asset: set.assets[yawIndex]![bankIndex]!,
    yawIndex,
    bankIndex,
  };
}
