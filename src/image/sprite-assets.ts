import { clamp, wrapAngle } from '../core/math.js';
import { createSpritePalette, readSpriteLodAsset, spriteLodLayout, type SpriteAsset } from './sprite.js';

export interface VehicleSpriteSet {
  readonly brakeLamp: Readonly<{ off: number; on: number }>;
  readonly yawVariants: number;
  readonly bankVariants: number;
  readonly assets: readonly (readonly SpriteAsset[])[];
}
export interface SpriteAssets {
  readonly sets: Readonly<Record<string, VehicleSpriteSet>>;
}

/** Admission of the build's completed sprite library. No image generation or filtering at runtime. */
export function readSpriteAssets(value: unknown): SpriteAssets {
  const library = record(value, ['format', 'version', 'sprites', 'sets']);
  if (library.format !== 'superoutride.vehicle-sprites' || library.version !== 3 || !Array.isArray(library.sprites))
    throw new RangeError('unsupported vehicle sprite library');
  const spriteDocuments = library.sprites;
  const sprites = new Map<number, { asset: SpriteAsset; off: number; on: number }>();
  const set = (value: unknown): VehicleSpriteSet => {
    const recordData = record(value, ['yawVariants', 'bankVariants', 'assets', 'brakeLamp']);
    const lamp = record(recordData.brakeLamp, ['off', 'on']);
    if (
      [lamp.off, lamp.on].some(
        (color) => typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color > 32767,
      )
    )
      throw new RangeError('sprite set brake lamp requires RGB555 off and on colors');
    const brakeLamp = Object.freeze({ off: lamp.off as number, on: lamp.on as number });
    const yawVariants = recordData.yawVariants,
      bankVariants = recordData.bankVariants;
    if (
      typeof yawVariants !== 'number' ||
      !Number.isSafeInteger(yawVariants) ||
      yawVariants < 1 ||
      typeof bankVariants !== 'number' ||
      !Number.isSafeInteger(bankVariants) ||
      bankVariants < 1 ||
      !Array.isArray(recordData.assets) ||
      recordData.assets.length !== yawVariants
    )
      throw new RangeError('vehicle sprite set needs complete positive yaw/bank dimensions');
    const assets = Array.from(recordData.assets, (row: unknown) => {
      if (!Array.isArray(row) || row.length !== bankVariants) throw new RangeError('vehicle sprite row is incomplete');
      return Object.freeze(
        Array.from(row, (id: unknown) => {
          if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || !spriteDocuments[id])
            throw new RangeError('vehicle sprite binding must name an existing pattern');
          let admitted = sprites.get(id);
          if (!admitted) {
            const asset = readSpriteLodAsset(spriteDocuments[id], [brakeLamp.off]);
            if (asset.levels.length !== spriteLodLayout(asset.width, asset.height).length)
              throw new RangeError('shipped sprites require the complete build-generated pyramid');
            admitted = { asset, ...brakeLamp };
            sprites.set(id, admitted);
          }
          if (admitted.off !== brakeLamp.off || admitted.on !== brakeLamp.on)
            throw new RangeError('shared vehicle images require the same set brake-lamp colors');
          return admitted.asset;
        }),
      );
    });
    const names = Object.keys(assets[0]![0]!.palettes).sort();
    if (names.length < 2) throw new RangeError('vehicle sprite set requires at least two named colors');
    for (const image of assets.flat()) {
      if (JSON.stringify(Object.keys(image.palettes).sort()) !== JSON.stringify(names))
        throw new RangeError('every image in a vehicle set must declare the same color names');
    }
    return Object.freeze({ brakeLamp, yawVariants, bankVariants, assets: Object.freeze(assets) });
  };
  if (!library.sets || typeof library.sets !== 'object' || Array.isArray(library.sets))
    throw new RangeError('vehicle sprite sets must be a named dictionary');
  const sets = Object.fromEntries(
    Object.entries(library.sets).map(([name, value]) => {
      if (!name.trim() || name !== name.trim()) throw new RangeError('sprite set name must be nonempty and trimmed');
      return [name, set(value)];
    }),
  );
  if (sprites.size !== spriteDocuments.length) throw new RangeError('vehicle image must belong to a sprite set');
  return Object.freeze({ sets: Object.freeze(sets) });
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

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RangeError('vehicle sprite library record required');
  const recordData = value as Record<string, unknown>;
  if (Object.keys(recordData).length !== keys.length || keys.some((key) => !Object.hasOwn(recordData, key)))
    throw new RangeError('vehicle sprite library has missing or unknown fields');
  return recordData;
}
