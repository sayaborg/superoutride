/**
 * TOP SPEED's things as its sub program composes them ([TOP SPEED road data](../../../docs/top-speed-road-data.md#its-things)):
 * a thing's code names its descriptor through two tables (S 0x165A6, 0x1662A), a head of 14 bytes and its parts of 12
 * after it, each piece a big sprite at its full size, 128 × 128 pixels, laid about the thing's point on the ground: the
 * head's cell its anchor's pixels left of the point and its bottom on the ground, each part's cell whole big sprites
 * from it, up and right, by its offsets (S 0x168D0 to 0x16944, the table at S 0x1B44A of k × (zoom + 1) for a word of
 * 2k, at the full size k × 128 pixels).
 */
import { instruction, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { rgb555Of } from '../taito/palette.js';
import { BIG_SPRITE } from './top-speed-sprites.js';

/** A head's bytes and a part's. */
const HEAD_BYTES = 0x0e;
const PART_BYTES = 0x0c;
/** The pieces' types the courses use: its zoom on both axes, its width fixed, and its width fixed at a screen column. */
export const SCALED = 0;
export const FIXED_WIDTH = 1;
export const SCREEN_WIDE = 5;
/** A part's byte 6's bit for its second copy. */
const SECOND_COPY = 0x40;

/**
 * A piece at its full size: its big sprite and its palette, its cell's top left (pixels from the thing's point on the
 * ground, down positive; a screen-wide piece's x its screen column), its flips and its type: 0 its zoom on both axes, 1
 * its width fixed (a band continued from its thing), 5 its width fixed at a screen column (a band across the view).
 */
export interface TopSpeedPiece {
  readonly sprite: number;
  readonly palette: number;
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly type: number;
}

/** A thing as its descriptor holds it: its pieces, the head's first, its size curve and its load record (0 none). */
export interface TopSpeedThing {
  readonly index: number;
  readonly pieces: readonly TopSpeedPiece[];
  readonly curve: number;
  readonly load: number;
  /** Whether the next descriptor is its picture left of P. */
  readonly leftVariant: boolean;
  /** Its tunnel line (its head's byte 6 bits 1 and 0, S 0x1689E): 1 where the road beyond is dark, 2 where it ends. */
  readonly line: number;
}

/** The tables a code's descriptor is found by: its index's bytes by code (S 0x165A6) and the descriptors' longs (S 0x1662A). */
function tables(sub: Uint8Array) {
  instruction(sub, 0x165a2, [0x0244, 0x0fff], "a code's low 12 bits (andi.w #$fff)");
  const [ih, il] = instruction(sub, 0x165a6, [0x47f9, null, null, 0x1833, 0x4000], "the codes' indices (lea, move.b)");
  instruction(sub, 0x16622, [0xe544, 0x0284, 0x0000, 0x03fc], 'an index, a long each (asl.w #2, andi.l #$3fc)');
  const [dh, dl] = instruction(sub, 0x1662a, [0x47f9, null, null, 0x2673, 0x4000], 'the descriptors (lea, movea.l)');
  instruction(sub, 0x16634, [0x082b, 0x0007, 0x0006], "a left variant's flag (btst #7, $6(a3))");
  instruction(sub, 0x168d0, [0x47eb, HEAD_BYTES], "a head's bytes (lea $e(a3))");
  instruction(sub, 0x168e4, [0x362b, 0x0002, 0x0243, 0xfffe], "a part's y offset's word (move.w $2(a3), andi.w)");
  instruction(sub, 0x16902, [0x182b, 0x0006, 0x0244, 0x001c], "a part's type (move.b $6(a3), andi.w #$1c)");
  instruction(sub, 0x16a30, [0x382b, 0x0004, 0x6b0e], "a fixed width's offset, pixels where negative (move.w, bmi)");
  instruction(sub, 0x1697a, [0x156b, 0x000b, 0x0006], "a second copy's palette (move.b $b(a3))");
  instruction(
    sub,
    0x16980,
    [0x3807, 0xe24c, 0x0244, 0x003f, 0x5343],
    'half its zoom lower, less a pixel (lsr.w, subq)',
  );
  instruction(sub, 0x16a3a, [0x3a2b, 0x0008, 0x0245, 0x0180], "a fixed width's step (move.w $8, andi.w #$180)");
  return { indices: ih * 0x10000 + il, descriptors: dh * 0x10000 + dl };
}

/** The descriptor index of code `code`. */
export function thingIndex(sub: Uint8Array, code: number): number {
  return sub[tables(sub).indices + (code & 0xfff)]!;
}

/**
 * The thing of descriptor `index`: its head (word 0 its pieces, word 2 its sprite and palette, 0 none, word 4 its
 * anchor, byte 6 bit 7 a left variant after it, byte 7 bit 6 its flip across, byte 8 bit 7 its flip down, byte 9 bits 4
 * to 2 its size curve, long 0xA its load record) and its parts (word 0 its sprite and palette, words 2 and 4 its
 * offsets up and right, byte 6 bits 4 to 2 its type, bytes 7 and 8 its flips).
 */
export function topSpeedThing(sub: Uint8Array, index: number): TopSpeedThing {
  const at =
    word(sub, tables(sub).descriptors + 4 * index) * 0x10000 + word(sub, tables(sub).descriptors + 4 * index + 2);
  if (at === 0 || at + HEAD_BYTES > sub.length)
    throw romDiffers(`TOP SPEED's descriptor ${index} lies past its program`);
  const count = word(sub, at);
  const anchor = sword(sub, at + 4);
  const head = word(sub, at + 2);
  const pieces: TopSpeedPiece[] = [];
  const piece = (w: number, x: number, y: number, flags7: number, flags8: number, type: number) =>
    w &&
    pieces.push({
      sprite: w & 0xff,
      palette: w >> 8,
      x,
      y,
      flipX: !!(flags7 & 0x40),
      flipY: !!(flags8 & 0x80),
      type,
    });
  piece(head, -anchor, -BIG_SPRITE, sub[at + 7]!, sub[at + 8]!, SCALED);
  for (let k = 1; k < count; k++) {
    const p = at + HEAD_BYTES + (k - 1) * PART_BYTES;
    const type = (sub[p + 6]! >> 2) & 7;
    // Its x: a screen-wide piece's its word, a screen column; a fixed width's a negative word as pixels, else its
    // offset and a step of its bytes 8 and 9 (S 0x16A30 to 0x16A44); any other's its offset.
    const offset = sword(sub, p + 4);
    const step = word(sub, p + 8) & 0x180;
    const x =
      type === SCREEN_WIDE
        ? offset
        : type === FIXED_WIDTH
          ? -anchor + (offset < 0 ? offset : BIG_SPRITE * (offset >> 1) + step)
          : -anchor + BIG_SPRITE * (offset >> 1);
    const y = -BIG_SPRITE - BIG_SPRITE * (sword(sub, p + 2) >> 1);
    piece(word(sub, p), x, y, sub[p + 7]!, sub[p + 8]!, type);
    // Its second copy, in its byte 0xB's palette, its bottom half its height less a pixel lower (S 0x1696A to 0x1699C).
    if (sub[p + 6]! & SECOND_COPY)
      piece((sub[p + 0xb]! << 8) | (word(sub, p) & 0xff), x, y + BIG_SPRITE / 2 - 2, sub[p + 7]!, sub[p + 8]!, type);
  }
  return {
    index,
    pieces,
    curve: (sub[at + 9]! >> 2) & 7,
    load: word(sub, at + 0xa) * 0x10000 + word(sub, at + 0xc),
    leftVariant: !!(sub[at + 6]! & 0x80),
    line: sub[at + 6]! & 3,
  };
}

/** A palette's pens. */
const PENS = 16;
/** The palette's lines the program copies at its start (0x800 longs: 256 lines of 16 pens). */
const LINES = 256;

/**
 * The things' palettes, RGB555 by line and pen, as the main program sets them at its start: 256 lines copied from the
 * table its `lea` names (M 0x568 to 0x578), then each line the list at M 0x59A names (a line, then its pens 1 to 15,
 * pen 0 cleared) until 0xFFFF (M 0x59A to 0x5D8).
 */
export function thingPalettes(main: Uint8Array): (line: number) => readonly number[] {
  const [high, low] = instruction(
    main,
    0x568,
    [0x41f9, null, null, 0x43f9, 0x0050, 0x0000],
    "the palette's lines (lea)",
  );
  instruction(main, 0x574, [0x303c, (LINES * PENS) / 2 - 1], 'its longs less one (move.w #$7ff)');
  const [lh, ll] = instruction(main, 0x59a, [0x41f9, null, null, 0x3018, 0x0c40, 0xffff], 'the lines set after (lea)');
  instruction(main, 0x5aa, [0xeb48], 'a line, 32 bytes (lsl.w #5)');
  const words = Uint16Array.from({ length: LINES * PENS }, (_, k) => word(main, high * 0x10000 + low + 2 * k));
  for (let at = lh * 0x10000 + ll; word(main, at) !== 0xffff; at += 2 * PENS) {
    const line = word(main, at);
    if (line >= LINES) throw romDiffers(`TOP SPEED sets palette line 0x${line.toString(16)}`);
    words[line * PENS] = 0;
    for (let pen = 1; pen < PENS; pen++) words[line * PENS + pen] = word(main, at + 2 * pen);
  }
  return (line) => Array.from({ length: PENS }, (_, pen) => rgb555Of(words[line * PENS + pen]!));
}

/** A size curve's rows, 4 bytes each, one each 64 positions of distance less than 0x8000 (S 0x16660 to 0x1666A). */
const CURVE_ROWS = 0x200;
/** The zoom at which a big sprite is drawn at its full size. */
const FULL = 0x7f;

/**
 * A sprite's pixel at its full size by size curve `curve`, road laterals: the builder takes its curve from the table at
 * S 0x16468 by its head's byte 9 (S 0x1664E to 0x1665C), a row by its distance, the row's zoom its byte 0 and its
 * lateral factor its word at 2 (S 0x1666E, 0x16672), screen pixels a lateral × the factor / 65536; at zoom 0x7F, the
 * nearest row's that has it, a sprite's pixel is a screen pixel.
 */
export function pixelLaterals(sub: Uint8Array, curve: number): number {
  const [high, low] = instruction(
    sub,
    0x1664e,
    [0x4df9, null, null, 0x182b, 0x0009, 0x0244, 0x001c],
    'the size curves (lea)',
  );
  instruction(sub, 0x1666e, [0x1e36, 0x4000, 0x3c36, 0x4002], "a row's zoom and factor (move.b, move.w $2)");
  const table = high * 0x10000 + low;
  const rows = word(sub, table + 4 * curve) * 0x10000 + word(sub, table + 4 * curve + 2);
  for (let r = CURVE_ROWS - 1; r >= 0; r--)
    if (sub[rows + 4 * r] === FULL) return 0x10000 / word(sub, rows + 4 * r + 2);
  throw romDiffers(`TOP SPEED's size curve ${curve} draws no sprite at its full size`);
}
