/**
 * OUTRUN's player's car, the Ferrari, as its program draws it
 * ([Original road data](../../docs/original-road-data.md#the-players-car)): its frames by steering, drawn into
 * TESTAROSSA's picture set as its [local original](../../docs/development.md#local-originals).
 */
import { requireInput } from '../course/authoring-io.js';
import { spritePalette } from './outrun-sprites.js';
import { spritePixels, type SpriteSize } from './sprite-pixels.js';

/**
 * The player's frames at 0x9ECC: three steering levels (under 0x12, under 0x1E, beyond) of three slopes, 8 bytes each,
 * {long size, word frame, word x offset}; the level slope's (the middle) is the one taken. A frame shows the car turned
 * left as stored, right mirrored, its x offset negated.
 */
const FRAMES = 0x9ecc;
const LEVEL = 1;
const SLOPES = 3;
/** Palettes 2 and 3 the car's (its wheels' two phases), 4 and 5 braking: the slot whose color 4 changes is the lamp. */
const CAR_PALETTE = 2;
const BRAKING_PALETTE = 4;
/** The yaw steps from behind where the mid and hard steering levels' frames begin. */
const TURN_STEPS = [1, 3] as const;

const word = (p: Uint8Array, a: number) => (p[a]! << 8) | p[a + 1]!;
const sword = (p: Uint8Array, a: number) => (word(p, a) << 16) >> 16;
const long = (p: Uint8Array, a: number) => ((word(p, a) << 16) | word(p, a + 2)) >>> 0;

/** A frame's pixels, its width and height, and its x offset, road pixels right of the car's centre as stored. */
interface Frame {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly offset: number;
}

/** The player's level frames by steering level, straight first. */
function playerFrames(main: Uint8Array, words: Uint32Array): Frame[] {
  return [0, 1, 2].map((level) => {
    const entry = FRAMES + 8 * (level * SLOPES + LEVEL);
    const a = long(main, entry);
    const size: SpriteSize = {
      width: word(main, a),
      height: word(main, a + 2),
      stride: word(main, a + 4),
      bank: main[a + 7]! & 3,
      offset: word(main, a + 8),
    };
    return {
      pixels: spritePixels(words, size),
      width: size.width,
      height: size.height,
      offset: sword(main, entry + 6),
    };
  });
}

/** The parts of a vehicle sprite set this conversion reads and writes. */
interface SpriteSetSize {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly rows: readonly string[];
}
interface SpriteSet {
  readonly yawVariants: number;
  readonly palettes: Readonly<Record<string, readonly number[]>>;
  readonly brakeLamp: { readonly off: number; readonly on: number };
  readonly assets: readonly (readonly number[])[];
  readonly pictures: readonly { readonly sizes: readonly (SpriteSetSize & { readonly shadow: unknown })[] }[];
}

/**
 * TESTAROSSA's set `published` with the Ferrari's pixels in place of its own, every size, anchor, shadow, palette name
 * and grid cell kept: each picture shows the frame of its yaw's steering level (straight seen from behind, mid one or
 * two steps turned, hard beyond), mirrored for a right turn, scaled by nearest pixel so its width at that size is the
 * straight picture's, its bottom on the picture's bottom and its middle at the anchor less its x offset. Every palette
 * is the car's: slots 1–14 its colors, the brake lamp slot 15 where the braking palette changes a color.
 */
export function playerOriginal<T extends SpriteSet>(main: Uint8Array, words: Uint32Array, published: T): T {
  const frames = playerFrames(main, words);
  const colors = spritePalette(main, CAR_PALETTE),
    braking = spritePalette(main, BRAKING_PALETTE);
  const lamps = colors.flatMap((c, v) => (v > 0 && v < 15 && c !== braking[v] ? [v] : []));
  requireInput(lamps.length === 1, '/sprites/testarossa', 'The braking palette changes one color, the lamp');
  const lamp = lamps[0]!;
  const straight = published.pictures[published.assets[0]![0]!]!.sizes;
  const pictures = published.pictures.map((picture, p) => {
    const yaw = published.assets.findIndex((cell) => cell.includes(p));
    const steps = yaw > published.yawVariants / 2 ? yaw - published.yawVariants : yaw;
    const frame = frames[TURN_STEPS.filter((limit) => Math.abs(steps) >= limit).length]!;
    const mirrored = steps > 0;
    return {
      ...picture,
      sizes: picture.sizes.map((size, s) => {
        const scale = straight[s]!.width / frames[0]!.width;
        const middle = size.anchorX + 0.5 - (mirrored ? -frame.offset : frame.offset) * scale;
        const rows = Array.from({ length: size.height }, (_, y) =>
          Array.from({ length: size.width }, (_, x) => {
            const fy = Math.floor(frame.height - (size.height - y - 0.5) / scale);
            const fx = Math.floor(frame.width / 2 + (x + 0.5 - middle) / scale);
            if (fy < 0 || fy >= frame.height || fx < 0 || fx >= frame.width) return '0';
            const v = frame.pixels[fy * frame.width + (mirrored ? frame.width - 1 - fx : fx)]!;
            return v === lamp ? 'f' : v.toString(16);
          }).join(''),
        );
        return { ...size, rows };
      }),
    };
  });
  const slots = colors.slice(1, 15);
  return {
    ...published,
    palettes: Object.fromEntries(Object.keys(published.palettes).map((name) => [name, slots])),
    brakeLamp: { off: colors[lamp]!, on: braking[lamp]! },
    pictures,
  };
}
