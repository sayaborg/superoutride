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

/** Whether every image of the set declares `color`: the colors a vehicle with this set can be drawn in. */
export function spriteSetHasColor(set: VehicleSpriteSet, color: string): boolean {
  return set.assets.every((row) => row.every((image) => Object.hasOwn(image.palettes, color)));
}

/** Every color the set can be drawn in, in its first image's declaration order. */
export function spriteSetColors(set: VehicleSpriteSet): readonly string[] {
  return Object.keys(set.assets[0]![0]!.palettes).filter((color) => spriteSetHasColor(set, color));
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

/**
 * The vehicle pictures' camera factor: they are baked with a camera this many times as far from the vehicle as the
 * scene's and this many times its focal length, so a picture has the scene's size and a flatter perspective. The
 * one authority for this value; pictures are rebaked with it.
 */
export const VEHICLE_SPRITE_CAMERA_FACTOR = 2;

/**
 * The direction from which the pictures show a vehicle whose position lies `cameraRight` metres right of the camera's
 * axis at depth `depth`: their camera's view ray, `atan(cameraRight / (factor * depth))`, positive to the right. A
 * picture is selected by the body's yaw relative to the camera less this direction.
 */
export function vehicleSpriteViewYaw(cameraRight: number, depth: number): number {
  return Math.atan2(cameraRight, VEHICLE_SPRITE_CAMERA_FACTOR * depth);
}

/**
 * How far past its sector's edge, in yaw steps, a held yaw image stays selected: an angle wavering at a boundary keeps
 * one image, and a steadily turning one changes image one step at a time.
 */
const YAW_HOLD_STEPS = 0.25;

function selectYawVariant(relativeYaw: number, count: number, held?: number): number {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('yaw variant count must be >= 1');
  const step = (Math.PI * 2) / count;
  if (
    held !== undefined &&
    held < count &&
    Math.abs(wrapAngle(relativeYaw - held * step)) <= step * (0.5 + YAW_HOLD_STEPS)
  )
    return held;
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

/**
 * `leanRadians` is the vehicle's centre-of-mass lean; the set's bankDegrees maps it to its bank images. `heldYawIndex`,
 * the yaw image this vehicle showed in its previous frame, stays selected within a quarter step beyond its sector.
 */
export function selectVehicleSprite(
  set: VehicleSpriteSet,
  relativeYaw: number,
  leanRadians = 0,
  heldYawIndex?: number,
): { asset: SpriteAsset; yawIndex: number; bankIndex: number } {
  const yawIndex = selectYawVariant(relativeYaw, set.yawVariants, heldYawIndex);
  const bank = set.bankDegrees === null ? 0 : leanRadians / ((set.bankDegrees * Math.PI) / 180);
  const bankIndex = selectBankVariant(bank, set.bankVariants);
  return {
    asset: set.assets[yawIndex]![bankIndex]!,
    yawIndex,
    bankIndex,
  };
}
