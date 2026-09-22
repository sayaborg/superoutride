import { clamp, wrapAngle } from '../core/math.js';
import { createSpritePaletteVariant, readSpriteLodAsset, spriteLodLayout, type SpriteAsset } from './sprite.js';

export interface VehicleSpriteSet {
  readonly kind: 'car' | 'bike';
  readonly yawVariants: number;
  readonly bankVariants: number;
  readonly assets: readonly (readonly SpriteAsset[])[];
}
export interface SpriteAssets {
  readonly car: VehicleSpriteSet;
  readonly bike: VehicleSpriteSet;
}

/** Admission of the build's completed sprite library. No image generation or filtering at runtime. */
export function readSpriteAssets(value: unknown): SpriteAssets {
  const library = record(value, ['format', 'version', 'sprites', 'car', 'bike']);
  if (library.format !== 'superoutride.vehicle-sprites' || library.version !== 1 || !Array.isArray(library.sprites))
    throw new RangeError('unsupported vehicle sprite library');
  const sprites = Array.from(library.sprites, (source: unknown) => {
    const asset = readSpriteLodAsset(source);
    if (asset.levels.length !== spriteLodLayout(asset.width, asset.height).length)
      throw new RangeError('shipped sprites require the complete build-generated pyramid');
    return asset;
  });
  const set = (value: unknown, kind: 'car' | 'bike'): VehicleSpriteSet => {
    const source = record(value, ['kind', 'yawVariants', 'bankVariants', 'assets']);
    const yawVariants = source.yawVariants,
      bankVariants = source.bankVariants;
    if (
      source.kind !== kind ||
      typeof yawVariants !== 'number' ||
      !Number.isSafeInteger(yawVariants) ||
      yawVariants < 1 ||
      typeof bankVariants !== 'number' ||
      !Number.isSafeInteger(bankVariants) ||
      bankVariants < 1 ||
      !Array.isArray(source.assets) ||
      source.assets.length !== yawVariants
    )
      throw new RangeError('vehicle sprite set needs complete positive yaw/bank dimensions');
    const assets = Array.from(source.assets, (row: unknown) => {
      if (!Array.isArray(row) || row.length !== bankVariants) throw new RangeError('vehicle sprite row is incomplete');
      return Object.freeze(
        Array.from(row, (id: unknown) => {
          if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || !sprites[id])
            throw new RangeError('vehicle sprite binding must name an existing pattern');
          return sprites[id]!;
        }),
      );
    });
    return Object.freeze({ kind, yawVariants, bankVariants, assets: Object.freeze(assets) });
  };
  return Object.freeze({ car: set(library.car, 'car'), bike: set(library.bike, 'bike') });
}

/** An instance binds one semantic base palette to every yaw/bank image and level once. */
export function createVehiclePaletteVariant(set: VehicleSpriteSet, palette: readonly number[]): VehicleSpriteSet {
  const images = new Map<SpriteAsset, SpriteAsset>();
  const assets = set.assets.map((row) =>
    Object.freeze(
      row.map((asset) => {
        let variant = images.get(asset);
        if (!variant) {
          variant = createSpritePaletteVariant(asset, palette);
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

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('vehicle sprite library record required');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== keys.length || keys.some((key) => !Object.hasOwn(source, key)))
    throw new RangeError('vehicle sprite library has missing or unknown fields');
  return source;
}
