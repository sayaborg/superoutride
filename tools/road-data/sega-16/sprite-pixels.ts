/**
 * The sprite hardware OUTRUN's board draws, shared by the originals that run on it ([OUTRUN road data](../../../docs/outrun-road-data.md#sprites)),
 * and Space Harrier's, which ENDURO RACER's board draws
 * ([ENDURO RACER's sprites](../../../docs/enduro-racer-road-data.md#enduro-racers-sprites)): the sprite ROMs' 32-bit words, a
 * size's pixels and outline, its base point by its anchor, and a shadow's frame on the texel grid.
 */
import { chosenLines } from '../shared/pixel-grid.js';

/**
 * How a sprite hardware reads its words: words a bank, where a row's end mark lies in a word (the pixel at `endShift`
 * is 15), and the anchor that puts a size's top edge at the object's y (the other of 4 and 8 its bottom edge).
 */
export interface SpriteHardware {
  readonly bankWords: number;
  readonly endShift: number;
  readonly topAnchor: 4 | 8;
}
/** OUTRUN's board: banks of 0x10000 words, a row ended by a word whose bits 4–7 are 15, anchor 4 the top. */
export const OUTRUN_SPRITES: SpriteHardware = Object.freeze({ bankWords: 0x10000, endShift: 4, topAnchor: 4 });
/** Space Harrier's board: banks of 0x8000 words, a row ended by a word whose last pixel is 15, anchor 4 the bottom. */
export const SPACE_HARRIER_SPRITES: SpriteHardware = Object.freeze({ bankWords: 0x8000, endShift: 0, topAnchor: 8 });

/** A set of four ROMs' words: ROM `k` gives byte `k` of each word, counted from the least significant. */
export function spriteWords(roms: readonly Uint8Array[]): Uint32Array {
  const [b0, b1, b2, b3] = roms;
  return Uint32Array.from(b0!, (low, i) => ((b3![i]! << 24) | (b2![i]! << 16) | (b1![i]! << 8) | low) >>> 0);
}

/** One size of a sprite: its width and height in pixels, words a row, and its first word: bank and offset. */
export interface SpriteSize {
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly bank: number;
  readonly offset: number;
}

/**
 * A size's pixels, row-major: each word eight 4-bit pixels, the most significant first, `stride` words a row from its
 * bank's offset. 0 and 15 are transparent; a row ends with the word that holds the hardware's end mark, and is
 * transparent beyond.
 */
export function spritePixels(words: Uint32Array, size: SpriteSize, hardware = OUTRUN_SPRITES): Uint8Array {
  const { bankWords, endShift } = hardware;
  const out = new Uint8Array(size.width * size.height);
  for (let y = 0; y < size.height; y++)
    for (let x = 0, ended = false; x < size.width && !ended; x++) {
      const w = words[size.bank * bankWords + ((size.offset + y * size.stride + (x >> 3)) & (bankWords - 1))]!;
      const v = (w >>> (28 - 4 * (x & 7))) & 15;
      out[y * size.width + x] = v === 15 ? 0 : v;
      if ((x & 7) === 7 && ((w >>> endShift) & 15) === 15) ended = true;
    }
  return out;
}

/** A size's outline, filled: its colored pixels, and every other pixel no path of transparent pixels joins to its edge. */
export function outline(pixels: Uint8Array, width: number): Uint8Array {
  const height = pixels.length / width;
  const shape = pixels.map((v) => (v > 0 ? 1 : 0));
  // The outside: transparent pixels reached from the edge.
  const outside = new Uint8Array(shape.length);
  const stack: number[] = [];
  const reach = (i: number) => {
    if (!shape[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    reach(x);
    reach((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    reach(y * width);
    reach(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!,
      x = i % width;
    if (x > 0) reach(i - 1);
    if (x < width - 1) reach(i + 1);
    if (i >= width) reach(i - width);
    if (i + width < shape.length) reach(i + width);
  }
  return shape.map((_, i) => (outside[i] ? 0 : 1));
}

/**
 * The base point of a size `width` × `height` drawn by `anchor` (bits 0–1 across: 1 its left edge at the object's x,
 * 2 its right edge, else its middle; bits 2–3 down: the hardware's top anchor its top at the object's y, the other of
 * 4 and 8 its bottom, else its middle), in texel-centre coordinates.
 */
export function anchorPoint(
  anchor: number,
  width: number,
  height: number,
  hardware = OUTRUN_SPRITES,
): { x: number; y: number } {
  const across = anchor & 3,
    down = anchor & 12;
  return {
    x: across === 1 ? -0.5 : across === 2 ? width - 0.5 : width / 2 - 0.5,
    y: down === hardware.topAnchor ? -0.5 : down === (12 ^ hardware.topAnchor) ? height - 0.5 : height / 2 - 0.5,
  };
}

/**
 * The shadow's binary frame (`width` pixels wide) on the texel grid of `scale` texels a pixel, anchored as `anchor`, its
 * base point `aside` source pixels across from there (the frame then stands that far the other way).
 */
export function shadowFrame(
  pixels: Uint8Array,
  width: number,
  scale: { readonly x: number; readonly y: number },
  anchor: number,
  aside: number,
) {
  const grid = chosenLines(pixels, width, scale.x, scale.y);
  const point = anchorPoint(anchor, grid.width, grid.height);
  return {
    width: grid.width,
    height: grid.height,
    anchorX: point.x - aside * scale.x,
    anchorY: point.y,
    levels: [{ indices: grid.indices }],
  };
}
