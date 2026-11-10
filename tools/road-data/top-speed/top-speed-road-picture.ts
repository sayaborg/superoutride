/**
 * TOP SPEED's road picture ([Original road data](../../../docs/original-road-data.md#an-originals-modules), [TOP SPEED
 * road data](../../../docs/top-speed-road-data.md#its-road-picture)): its road at its nearest line, each side a tile
 * layer's picture of one half of the road from P outward, its lines, its edge's two bands and the ground beyond, each
 * found by the instructions that read it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { tilePen } from '../taito/tc0100scn.js';
import { LANE_METRES } from './top-speed-road.js';

/** The pictures' pens: the lines, the edge's inner and outer bands, the surface and the ground; 0 is clear. */
export const PENS = Object.freeze({ line: 1, inner: 2, outer: 3, surface: 4, ground: 5 });
/** A tile's pixels, and a picture's row's tiles. */
const TILE = 8;
const ROW_TILES = 256;
/** The lanes of the right half's picture in steady driving. */
const PICTURE_LANES = 3;
/** The road's first line's row on the screen (MAME's description, the raster table's entry 0xAE) and its rows. */
const ROAD_TOP = 160;
const SCREEN_ROWS = 240;

/**
 * The road at its nearest line: the right half's picture in steady driving (M 0x4190), a list of a pointer a tile row
 * (M 0x4350 reads a row's tile codes forward), at the screen's last line, its 80th from the road's first; a lane's
 * pixels there the main program's edge offsets', 0x128 units a lane (M 0x7FC0) times the line's number over 0xA0
 * (M 0x7F28 to 0x7F30).
 */
function nearestLine(main: Uint8Array, gfx: Uint8Array, at = 0x4190, what = "the right half's picture (lea)") {
  const [high, low] = instruction(main, at, [0x47f9, null, null], what);
  const list = high * 0x10000 + low;
  const [units] = instruction(main, 0x7fc0, [0x303c, null], "a lane's edge units (move.w)");
  const [divisor] = instruction(main, 0x7f30, [0x343c, null], "a line's edge offsets' divisor (move.w)");
  const line = SCREEN_ROWS - ROAD_TOP - 1;
  const row = long(main, list + 4 * (line >> 3));
  const pixels = Array.from({ length: ROW_TILES * TILE }, (_, x) =>
    tilePen(gfx, word(main, row + 2 * (x >> 3)) & 0x3fff, x & 7, line & 7),
  );
  return { pixels, lanePixels: (units * (line + 1)) / divisor };
}

/** A line's runs of one pen. */
function runsOf(pixels: readonly number[]) {
  const runs: { from: number; to: number; pen: number }[] = [];
  for (let x = 0; x < pixels.length;) {
    let end = x;
    while (end < pixels.length && pixels[end] === pixels[x]) end++;
    runs.push({ from: x, to: end, pen: pixels[x]! });
    x = end;
  }
  return runs;
}

/** The steady picture's P, pixels, where its lane lines' middles lie a lane and two from it, and a pixel's metres from it. */
function pictureScale({ pixels, lanePixels }: ReturnType<typeof nearestLine>) {
  // The lane lines a lane and two from P, its last lines before its edge.
  const lanes = runsOf(pixels)
    .filter((r) => r.pen === PENS.line)
    .slice(-(PICTURE_LANES - 1));
  const middles = lanes.map((r) => (r.from + r.to) / 2);
  const p = middles[0]! - lanePixels;
  if (lanes.length !== PICTURE_LANES - 1 || middles.some((m, k) => Math.abs(m - p - (k + 1) * lanePixels) > 0.5))
    throw romDiffers("The road picture's lane lines are not a lane apart");
  return { p, metres: (x: number) => ((x - p) / lanePixels) * LANE_METRES };
}

/** A band of the picture, metres right of P. */
export interface PictureBand {
  readonly left: number;
  readonly right: number;
}

/**
 * The road's picture at its nearest line, one side of three lanes, metres outward from P: its lines (pen 1), its edge's
 * inner and outer bands (pens 2 and 3), and its edge's width beyond its lanes, to where the ground begins; P where its
 * lane lines' middles lie a lane apart from it.
 */
export function topSpeedRoadPicture(main: Uint8Array, gfx: Uint8Array) {
  const line = nearestLine(main, gfx);
  const { lanePixels } = line;
  const runs = runsOf(line.pixels);
  const lines = runs.filter((r) => r.pen === PENS.line);
  const { metres } = pictureScale(line);
  const band = (pen: number): PictureBand => {
    const r = runs.filter((x) => x.pen === pen);
    if (r.length !== 1) throw romDiffers(`The road picture holds ${r.length} bands of pen ${pen}`);
    return { left: metres(r[0]!.from), right: metres(r[0]!.to) };
  };
  const [inner, outer] = [band(PENS.inner), band(PENS.outer)];
  const after = runs[runs.findIndex((r) => r.pen === PENS.outer) + 1];
  if (after?.pen !== PENS.ground || inner.right !== outer.left)
    throw romDiffers("The road picture's edge is not its inner band, its outer band and the ground");
  return {
    lines: lines.map((r): PictureBand => ({ left: metres(r.from), right: metres(r.to) })),
    inner,
    outer,
    /** The edge's width beyond the lanes, to the ground. */
    edgeMetres: outer.right - PICTURE_LANES * LANE_METRES,
    /** A pixel's metres across at the nearest line. */
    pixelMetres: LANE_METRES / lanePixels,
  };
}

/** A section's records, and a record's positions' bits in the camera's position (its bits 17 to 13 its record). */
const SECTION_RECORDS = 32;
const RECORD_BITS = 13;

/**
 * The fork's pictures and its gap ([Its fork](../../../docs/top-speed-road-data.md#top-speeds-courses)): while the
 * camera's record or one of the `records - 1` after it in its section is a fork's (its join 3, M 0x5B0A to 0x5B62), and
 * after it until the road not taken is gone (M 0x5A08 to 0x5A54, 0x5FF0), each half is drawn by a fork picture (M
 * 0x3FAC, 0x4198), which holds at its P, in place of the line there, a band of the outer band's pen `band` metres wide,
 * the left half's clear beyond P and the right half's, the layer beneath it (M 0x3EEE, 0x4122), the ground's pen. Over
 * the camera's records `gaps` of a fork's section each half is moved outward by pixels on every line (M 0x5A80 to
 * 0x5B08, added to each half's slide at M 0x3B64 to 0x3B78), `left` and `right`, the ground's pen showing between them.
 */
export function topSpeedForkPicture(main: Uint8Array, gfx: Uint8Array) {
  const { p, metres } = pictureScale(nearestLine(main, gfx));
  const bandOf = (at: number, what: string, beyond: number) => {
    const runs = runsOf(nearestLine(main, gfx, at, what).pixels);
    const k = runs.findIndex((r) => r.pen === PENS.outer);
    const band = runs[k];
    if (k !== 1 || !band || Math.abs(band.from - p) > 0.5 || runs[0]!.pen !== beyond || runs[2]?.pen !== PENS.surface)
      throw romDiffers(`A fork picture's band (${what}) does not lie at P between pen ${beyond} and the surface`);
    return metres(band.to) - metres(band.from);
  };
  const [left, right] = [
    bandOf(0x3fde, "the left half's fork picture (lea)", 0),
    bandOf(0x41ca, "the right half's fork picture (lea)", PENS.ground),
  ];
  if (left !== right) throw romDiffers("The fork pictures' bands differ in width");
  instruction(main, 0x3eee, [0x43f9, 0x00a0, 0x8002], "the left half's layer, the first chip's (lea)");
  instruction(main, 0x4122, [0x43f9, 0x00b0, 0x0002], "the right half's layer, the second chip's (lea)");
  instruction(main, 0x5b0a, [0x343c, 0x0300], "a fork's join (move.w #$300)");
  const [ahead] = instruction(main, 0x5b0e, [0x3c3c, null], 'the records looked ahead (move.w)');
  instruction(main, 0x5b3c, [0x3012, 0x0240, 0x0300, 0xb042, 0x6718], "a record's join a fork's (andi.w, cmp.w, beq)");
  instruction(main, 0x5b56, [0x51ce, 0xffe4], 'the next record (dbra)');
  // The gap: the camera's record of its section, its position's bits 17 to 13, against four records, each setting the
  // left half's pixels (negative, leftward) and the right half's.
  instruction(main, 0x5a8e, [0x0280, 0x0003, 0xe000], "the camera's record of its section (andi.l #$3e000)");
  instruction(main, 0x3b64, [0x3239, 0x0040, 0x10d0, 0xd279, 0x0040, 0x10f6], "the right half's pixels (add.w)");
  instruction(main, 0x3b72, [0x3239, 0x0040, 0x10ce, 0xd279, 0x0040, 0x10f4], "the left half's pixels (add.w)");
  const gaps = [0x5a94, 0x5a9c, 0x5aa4, 0x5aac].map((at) => {
    const [position, branch] = instruction(main, at, [0x0c80, 0x0003, null, null], "a gap's record (cmpi.l, beq)");
    if (branch >> 8 !== 0x67) throw romDiffers(`The program at 0x${at.toString(16)} is not a gap's record's branch`);
    const [l, r] = instruction(
      main,
      at + 8 + (branch & 0xff),
      [0x33fc, null, 0x0040, 0x10f4, 0x33fc, null, 0x0040, 0x10f6],
      "a gap's pixels, left and right (move.w)",
    );
    const leftward = -((l << 16) >> 16);
    if (leftward < 0 || r > 0x7fff) throw romDiffers('A gap moves a half inward');
    return { record: (0x30000 + position) >> RECORD_BITS, left: leftward, right: r };
  });
  gaps.sort((a, b) => a.record - b.record);
  if (gaps.some((g, k) => g.record !== SECTION_RECORDS - gaps.length + k))
    throw romDiffers("The gap's records are not a section's last");
  return { band: left, records: ahead + 1, gaps };
}

/**
 * The road's colors, palette words: its surface's by a color set and a record's field (the table at M 0xBA710, 4 bytes
 * a set from set 1 and a word by the field's bit 2, M 0x479C to 0x47B8), and its lines' and edge bands' pens in the
 * palette lines the program loads from 0x100 at its start (M 0x57E, 0x584), 0x101 drawing the lines and 0x100, on and
 * before a hill, none (`hills`, M 0x79F2): their pens 1 to 3 as loaded, pen 1 of line 0x100 taking the surface's.
 */
export function topSpeedRoadColors(main: Uint8Array) {
  const [high, low] = instruction(main, 0x479c, [0x41f9, null, null], "the surface's colors (lea)");
  instruction(main, 0x47a8, [0x5346, 0x6402, 0x4246, 0xe54e], 'a color set, 4 bytes from set 1 (lsl.w #2)');
  instruction(main, 0x47b2, [0x0240, 0x1000, 0xeb58], "the field's bit 2 (andi.w #$1000, rol.w #5)");
  const [startHigh, startLow] = instruction(main, 0x57e, [0x41f9, null, null], "the road's lines' colors (lea)");
  instruction(main, 0x584, [0x43f9, 0x0050, 0x2000], "the road's first line, 0x100 (lea)");
  const surfaces = high * 0x10000 + low;
  const lines = startHigh * 0x10000 + startLow;
  const PENS_A_LINE = 16;
  return {
    surface: (set: number, scene: number) => word(main, surfaces + 4 * Math.max(0, set - 1) + (scene & 4 ? 2 : 0)),
    /** Pen `pen` (1 to 3) of the lines' palette line, 0x100 on and before a hill (`hill`) and 0x101 elsewhere. */
    pen: (hill: boolean, pen: number) => word(main, lines + 2 * ((hill ? 0 : PENS_A_LINE) + pen)),
  };
}

/**
 * The ticks the road's and the ground's colors take to fade from palette words `from` to `to`: each 5-bit channel a
 * step toward the new each time its entry is written (M 0x4830 to 0x48A2), the ground's and the surface's entries
 * written on alternate frames (M 0x45F8, 0x4604), so two ticks a step of the largest channel's change.
 */
export function fadeTicks(main: Uint8Array): (from: readonly number[], to: readonly number[]) => number {
  instruction(main, 0x4604, [0x0800, 0x0000], "the colors' groups written on alternate frames (btst.b #0)");
  const channel = (c: number, k: number) => (c >> (5 * k)) & 31;
  return (from, to) =>
    2 * Math.max(0, ...from.flatMap((c, i) => [0, 1, 2].map((k) => Math.abs(channel(c, k) - channel(to[i]!, k)))));
}

/** A raster word's bits as MAME's description has them: the surface's and the ground's other shade, pens 1 and 2 drawn
 * as the surface, pen 3 drawn as the surface. */
export const RASTER = Object.freeze({ surface: 0x10, ground: 0x02, lines: 0x08, outer: 0x04 });

/**
 * The raster words of a road's line by its place, four parts of 0x400 positions each 0x1000 (M 0x38D6 to 0x39A6): the
 * position's bit 10 adds one word and its bit 11 another to a base, the flat road's and a hill's.
 */
export function stripeWords(main: Uint8Array) {
  instruction(main, 0x394c, [0x3e3c, 0x000b, 0x3a3c, 0x000a], "the place's bits 11 and 10 (move.w)");
  const [flatHigh] = instruction(main, 0x395e, [0x363c, null], "the flat road's bit 11's word (move.w)");
  const [flatLow] = instruction(main, 0x3962, [0x383c, null, 0x4242], "the flat road's bit 10's word, base 0 (move.w)");
  const [hillHigh] = instruction(main, 0x3982, [0x363c, null], "a hill's bit 11's word (move.w)");
  const [hillLow] = instruction(main, 0x3986, [0x383c, null], "a hill's bit 10's word (move.w)");
  const [hillBase] = instruction(main, 0x398a, [0x343c, null], "a hill's base (move.w)");
  const parts = (base: number, low: number, high: number) =>
    [0, 1, 2, 3].map((k) => base | (k & 1 ? low : 0) | (k & 2 ? high : 0));
  return { flat: parts(0, flatLow, flatHigh), hill: parts(hillBase, hillLow, hillHigh), positions: 0x1000 };
}

/**
 * Whether the road is drawn as on a hill at each of a course's records (M 0x6DDE to 0x6E76): where it or one of the
 * next four, up to a fork's record, has a grade.
 */
export function hills(main: Uint8Array, records: readonly { readonly grade: number; readonly join: number }[]) {
  instruction(main, 0x6e26, [0x3c3c, 0x0004], 'five records (move.w #4, dbra)');
  instruction(main, 0x6e36, [0x102a, 0x0002, 0x0200, 0x0003, 0x0c00, 0x0003, 0x6732], 'up to a fork (cmpi.b #3, beq)');
  instruction(main, 0x6e44, [0x3012, 0xc042, 0x6706, 0x33c5, 0x0040, 0x10ea], 'a grade sets the flag (and.w, move.w)');
  return records.map((_, i) => {
    for (let k = i; k < Math.min(records.length, i + 5); k++) {
      if (records[k]!.join === 3) return false;
      if (records[k]!.grade !== 0) return true;
    }
    return false;
  });
}
