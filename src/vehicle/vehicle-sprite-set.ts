import { clamp, wrapAngle } from '../core/math.js';
import type { SpriteAsset, SpriteFrame } from '../image/sprite.js';

/**
 * One size of a vehicle picture, size `k` at `40 / 2^k` texels per metre at its base point: its indices into the set's
 * palette and its shadow's frame, on the same texel grid.
 */
export interface VehiclePictureSize extends SpriteFrame {
  readonly shadow: SpriteFrame;
}

/** One cell's picture: every size, each its own picture of the vehicle seen from that size's camera. */
export interface VehiclePicture {
  readonly name: string;
  readonly sizes: readonly VehiclePictureSize[];
}

/**
 * An admitted vehicle sprite set: its yaw × bank grid of pictures and one palette for all of them, slots 1–14 by color
 * name and slot 15 the brake lamp, off or on.
 */
export interface VehicleSpriteSet {
  readonly yawVariants: number;
  readonly bankVariants: number;
  /**
   * The lean from vertical of the rider-and-machine centre-of-mass line that the outermost bank images
   * depict; null for a set with one bank image.
   */
  readonly bankDegrees: number | null;
  /** The color names, in declaration order. */
  readonly colors: readonly string[];
  /** Slots 1–14 by color name. */
  readonly palettes: Readonly<Record<string, readonly number[]>>;
  readonly brakeLamp: Readonly<{ off: number; on: number }>;
  readonly pictures: readonly (readonly VehiclePicture[])[];
}

/** A set's pictures in one color and lamp state, ready to draw. */
export interface VehicleSpriteImages {
  readonly yawVariants: number;
  readonly bankVariants: number;
  readonly bankDegrees: number | null;
  readonly assets: readonly (readonly SpriteAsset[])[];
}

/** Whether the set declares `color`: the colors a vehicle with this set can be drawn in. */
export function spriteSetHasColor(set: VehicleSpriteSet, color: string): boolean {
  return set.colors.includes(color);
}

/** Every color the set can be drawn in, in declaration order. */
export function spriteSetColors(set: VehicleSpriteSet): readonly string[] {
  return set.colors;
}

/** A set's pictures in a color and lamp state: the set's one palette, made once, for every picture and size. */
export function createVehiclePaletteVariant(
  set: VehicleSpriteSet,
  color: string,
  brakeLampOn = false,
): VehicleSpriteImages {
  const paletteRgb555 = Object.freeze([0, ...set.palettes[color]!, brakeLampOn ? set.brakeLamp.on : set.brakeLamp.off]);
  const images = new Map<VehiclePicture, SpriteAsset>();
  const assets = set.pictures.map((row) =>
    Object.freeze(
      row.map((picture) => {
        let asset = images.get(picture);
        if (!asset) {
          const levels = picture.sizes.map((size) => Object.freeze({ ...size, paletteRgb555 }));
          asset = Object.freeze({ name: picture.name, levels: Object.freeze(levels) });
          images.set(picture, asset);
        }
        return asset;
      }),
    ),
  );
  const { yawVariants, bankVariants, bankDegrees } = set;
  return Object.freeze({ yawVariants, bankVariants, bankDegrees, assets: Object.freeze(assets) });
}

/**
 * The direction from which the camera sees a vehicle whose base point lies `cameraRight` metres right of the camera's
 * axis at depth `depth`: its view ray, `atan(cameraRight / depth)`, positive to the right. A picture is selected by the
 * body's yaw relative to the camera less this direction.
 */
export function vehicleSpriteViewYaw(cameraRight: number, depth: number): number {
  return Math.atan2(cameraRight, depth);
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
  set: VehicleSpriteImages,
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
