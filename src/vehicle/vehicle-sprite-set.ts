import { clamp, wrapAngle } from '../core/math.js';
import { createSpritePalette, type SpriteAsset } from '../image/sprite.js';

export interface VehicleSpriteSet {
  readonly brakeLamp: Readonly<{ off: number; on: number }>;
  readonly yawVariants: number;
  readonly bankVariants: number;
  /**
   * The lean from vertical of the rider-and-machine centre-of-mass line that the outermost bank images
   * depict; null for a set with one bank image.
   */
  readonly bankDegrees: number | null;
  readonly assets: readonly (readonly SpriteAsset[])[];
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

/** `leanRadians` is the vehicle's centre-of-mass lean; the set's bankDegrees maps it to its bank images. */
export function selectVehicleSprite(
  set: VehicleSpriteSet,
  relativeYaw: number,
  leanRadians = 0,
): { asset: SpriteAsset; yawIndex: number; bankIndex: number } {
  const yawIndex = selectYawVariant(relativeYaw, set.yawVariants);
  const bank = set.bankDegrees === null ? 0 : leanRadians / ((set.bankDegrees * Math.PI) / 180);
  const bankIndex = selectBankVariant(bank, set.bankVariants);
  return {
    asset: set.assets[yawIndex]![bankIndex]!,
    yawIndex,
    bankIndex,
  };
}
