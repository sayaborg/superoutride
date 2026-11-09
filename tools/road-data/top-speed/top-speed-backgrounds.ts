/**
 * TOP SPEED's skies ([Original road data](../../../docs/original-road-data.md#sky-baking), [TOP SPEED road
 * data](../../../docs/top-speed-road-data.md#its-skies)): the bands the second PC080SN's bottom layer draws above the
 * horizon, each a picture of 128 columns of tiles, 1,024 pixels: the horizon band (band A), which faces the sky and turns
 * a turn of its pixels, and the cloud band (band B) over it, one strip or three, each turning at its share of band A's
 * turn; each colored by its band's palette line in a color set, over the cloud band's pen 1; each table found by the
 * instruction that reads it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { SkyBand, SkyBands } from '../shared/sky-baking.js';
import { rgb555Of } from '../taito/palette.js';
import { tilePen } from '../taito/tc0100scn.js';
import type { TopSpeedRecord } from './top-speed-road.js';

/** A record's event a tunnel. */
const TUNNEL = 3;

/** A tile's pixels across and down, a picture's columns and the horizon band's pixels a turn. */
const TILE = 8;
export const SKY_COLUMNS = 128;
export const SKY_TURN = SKY_COLUMNS * TILE;
/** A line's pens. */
const PENS = 16;
/**
 * The picture's pixel at the screen's middle as a band is loaded (M 0x8DEE): its first 44 columns copied from its column
 * 32 (the word at M 0x90A6) on, its scroll 0, the layer's columns shown from its 16th pixel (MAME's description), the
 * middle 160 pixels in: 432. Every band faces it where it is loaded, at a stage's start and wherever it changes.
 */
export const SKY_MIDDLE = 32 * TILE + 16 + 160;
/** The horizon band's pixel behind the facing, where a cloud strip turning other than a turn has its seam. */
export const SKY_SEAM = SKY_MIDDLE + SKY_TURN / 2;
/**
 * The cloud band's strips: whole (a picture of odd index), or three of 6, 4 and 3 rows (an even index); each its share
 * of the horizon band's turn, its accumulator's fraction bits against the horizon band's 21 and the top strip's input a
 * quarter more (M 0x8A6A to 0x8B66).
 */
const CLOUDS = Object.freeze({
  whole: [{ rows: 13, share: 1 / 2 }],
  split: [
    { rows: 6, share: 3 / 4 },
    { rows: 4, share: 1 / 2 },
    { rows: 3, share: 1 / 4 },
  ],
});
/** The horizon band's last row against the road's first line: two lines below it in steady driving (M 0x76B6, 0x777A). */
const HORIZON_BOTTOM = 1;

/**
 * The color set of stage `stage` (0 to 4) in its section `section`, which colors its sky and its road (M 0x4898): twice
 * the stage plus 1, one more from the camera's section 7 on (its last sections and its goal section).
 */
export function colorSet(main: Uint8Array, stage: number, section: number): number {
  instruction(main, 0x4898, [0x1039, 0x0040, 0x2825], 'the stage (move.b)');
  const sets = [0x48c2, 0x48c8, 0x48ce, 0x48d4, 0x48da].map(
    (at) => instruction(main, at, [0x343c, null], "a stage's color set (move.w)")[0],
  );
  const [last] = instruction(main, 0x48de, [0x0c39, null, 0x0040, 0x104c], "the section's set changes from (cmpi.b)");
  instruction(main, 0x48e6, [0x6502, 0x5242], 'one more from it (bcs.b, addq.w #1)');
  const set = sets[stage];
  if (set === undefined) throw new RangeError(`TOP SPEED has no stage ${stage}`);
  return set + (section >= last ? 1 : 0);
}

/** The main program's tables for its skies, each found by the instruction that reads it. */
function tables(main: Uint8Array) {
  const [displacement] = instruction(main, 0x8e62, [0x47fa, null], "the bands' descriptors (lea)");
  const descriptors = 0x8e64 + displacement;
  instruction(main, 0x8e66, [0x3207, 0xeb49, 0xd6c1, 0xe948, 0x4a47, 0x6702, 0xe548], "a band's descriptor");
  // A color set's lines: each band's source, 128 bytes a set, and the lines it is copied to in turn (M 0x86F4, 0x872A).
  const lines = new Map<number, (set: number) => number>();
  for (const [at, destinations] of [
    [0x86f4, [0x8700, 0x870a, 0x8714, 0x871e]],
    [0x872a, [0x8736, 0x8740, 0x874a, 0x8754]],
  ] as const) {
    const [high, low] = instruction(main, at, [0x49f9, null, null, 0x3200, 0xef49], "a band's colors (lea, lsl.w #7)");
    destinations.forEach((d, k) => {
      const [to] = instruction(main, d, [0x47f9, 0x0050, null], "a band's line (lea)");
      lines.set(to / (2 * PENS), (set) => high * 0x10000 + low + 128 * set + 2 * PENS * k);
    });
  }
  // The horizon band's background pen takes a pen of the cloud band's line (M 0x861A to 0x8638).
  const [shared] = instruction(main, 0x861a, [0x49fa, null], 'the shared horizon pen (lea)');
  const horizonPens = [0x862c, 0x8630, 0x8634, 0x8638].map((at) => {
    const [offset] = instruction(main, at, [0x3341, null], "a horizon line's shared pen (move.w)");
    return { line: offset >> 5, pen: (offset & 31) >> 1 };
  });
  return { descriptors, lines, sharedPens: 0x861c + shared, horizonPens };
}

/** A band's descriptor (16 bytes): its picture, its palette line and its rows. */
const descriptor = (main: Uint8Array, at: number) => ({
  source: word(main, at) * 0x10000 + word(main, at + 2),
  line: word(main, at + 8) & 0x1ff,
  rows: word(main, at + 10),
});

/**
 * The sky of horizon picture `a`, cloud picture `b` (0 to 3 each) and color set `set` (1 to 10), tiles from graphics
 * `gfx`: the cloud band's strips and the horizon band, one opaque layer, the horizon band facing, each strip's seam
 * behind the facing's; the cloud band's pen 1, the flat sky, above them.
 */
export function topSpeedSky(main: Uint8Array, gfx: Uint8Array, a: number, b: number, set: number): SkyBands {
  const t = tables(main);
  const horizon = descriptor(main, t.descriptors + 16 * a);
  const clouds = [0, 1, 2, 3].map((k) => descriptor(main, t.descriptors + 64 + 64 * b + 16 * k));
  const colors = (line: number) => {
    const at = t.lines.get(line);
    if (!at) throw romDiffers(`TOP SPEED's sky line 0x${line.toString(16)} takes no colors`);
    return Array.from({ length: PENS }, (_, pen) => rgb555Of(word(main, at(set) + 2 * pen)));
  };
  const cloudColors = colors(clouds[0]!.line);
  const sharedPen = word(main, t.sharedPens + 2 * b) >> 1;
  const horizonColors = colors(horizon.line).map((color, pen) =>
    t.horizonPens.some((h) => h.line === horizon.line && h.pen === pen) ? cloudColors[sharedPen]! : color,
  );
  // A strip: rows `rows` of a picture from row `first`, its last row `bottom` rows below the horizon.
  const strip = (source: number, all: number, first: number, rows: number, colorsOf: readonly number[]) => {
    const pixels = new Int32Array(SKY_TURN * rows * TILE);
    for (let column = 0; column < SKY_COLUMNS; column++)
      for (let row = 0; row < rows; row++) {
        const code = word(main, source + 2 * (column * all + first + row));
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            pixels[(row * TILE + y) * SKY_TURN + column * TILE + x] = colorsOf[tilePen(gfx, code, x, y)]!;
      }
    return pixels;
  };
  const horizonBand: SkyBand = {
    width: SKY_TURN,
    pixels: strip(horizon.source, horizon.rows, 0, horizon.rows, horizonColors),
    bottom: HORIZON_BOTTOM,
  };
  const strips = b % 2 ? CLOUDS.whole : CLOUDS.split;
  let below = HORIZON_BOTTOM - horizon.rows * TILE;
  let first = clouds[0]!.rows;
  const cloudBands = [...strips].reverse().map(({ rows, share }) => {
    first -= rows;
    const band: SkyBand = {
      width: SKY_TURN,
      pixels: strip(clouds[0]!.source, clouds[0]!.rows, first, rows, cloudColors),
      bottom: below,
      turn: SKY_TURN * share,
      overlap: SKY_MIDDLE * (1 - 1 / share),
    };
    below -= rows * TILE;
    return band;
  });
  if (first !== 0) throw romDiffers("TOP SPEED's cloud band's strips are not its rows");
  return {
    layers: [...cloudBands.reverse(), horizonBand],
    facing: cloudBands.length,
    seam: SKY_SEAM,
    ramp: { rows: [cloudColors[1]!], below: cloudColors[1]! },
  };
}

/** A course's record as its sky reads it: its record and its section, and its stage's. */
interface SkyRecord {
  readonly record: TopSpeedRecord;
  readonly stage: number;
  readonly section: number;
}

/** A sky along a course: from record `record` on, its horizon picture, its cloud picture and its color set. */
export interface SkyChange {
  readonly record: number;
  readonly a: number;
  readonly b: number;
  readonly set: number;
}

/**
 * Where a course's sky changes, from its start: the pictures a run starts with (M 0x744: the city and the white clouds,
 * which each stage's start takes, M 0x2F20), the color set by its stage and section (`colorSet`), and each record
 * whose word at 2 masked by 0x1C00 is 0x1000 or 0x1800 (M 0x890C to 0x891E), which changes the horizon picture to
 * twice the word's bit 11 and the next record's byte 2's bit 4, and the cloud picture to that byte's bits 3 and 2 (the
 * table at M 0x8A2A, M 0x8920 to 0x8936), the cloud picture only in a tunnel (M 0x8938 to 0x8944), a tunnel's record
 * as the records give it.
 */
export function skyChanges(main: Uint8Array, records: readonly SkyRecord[]): SkyChange[] {
  const [start, startB] = instruction(main, 0x744, [0x23fc, null, null, 0x0040, 0x0038], "a run's pictures (move.l)");
  instruction(main, 0x2f20, [0x23f9, 0x0040, 0x0038, 0x0040, 0x1180], "a stage's pictures (move.l)");
  const [field, first, second] = instruction(
    main,
    0x8910,
    [0x0240, null, 0x0c40, null, 0x6706, 0x0c40, null],
    'a change record (andi.w, cmpi.w)',
  );
  const [high] = instruction(
    main,
    0x8920,
    [0x0240, null, 0xec48],
    "the field's high bit, 8 entries (andi.w, lsr.w #6)",
  );
  const [displacement] = instruction(main, 0x8926, [0x49fa, null], "the pictures' table (lea)");
  instruction(main, 0x892e, [0x102b, 0x0008, 0x0200, 0x001c], "the next record's field (move.b, andi.b)");
  instruction(main, 0x8938, [0x4a68, 0x003c, 0x670c], 'the cloud picture only in a tunnel (tst.w, beq.b)');
  // The field is a record's word at 2's bits 12 to 10, its scene.
  if (field !== 0x1c00 || high !== 0x800) throw romDiffers("TOP SPEED's sky changes are not its records' field's");
  const changing = [first, second].map((w) => w >> 10);
  const table = 0x8928 + displacement;
  const out: SkyChange[] = [];
  let [a, b] = [start, startB];
  records.forEach(({ record, stage, section }, i) => {
    const next = records[i + 1]?.record;
    if (next && changing.includes(record.scene)) {
      const entry = table + 4 * ((record.scene & (high >> 10) ? 8 : 0) + next.scene);
      a = word(main, entry);
      if (record.event === TUNNEL) b = word(main, entry + 2);
    }
    const set = colorSet(main, stage, section);
    const last = out.at(-1);
    if (!last || last.a !== a || last.b !== b || last.set !== set) out.push({ record: i, a: a!, b: b!, set });
  });
  return out;
}
