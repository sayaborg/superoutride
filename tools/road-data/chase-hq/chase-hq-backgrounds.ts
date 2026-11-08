/**
 * CHASE H.Q.'s skies ([Original road data](../../../docs/original-road-data.md#sky-baking)): the bands its two tile
 * layers draw above the horizon, each 96 columns of tiles, 768 pixels: the far band (BG1's upper 18 rows), which faces
 * the sky and turns a turn of its 768 pixels, and the nearer bands (BG1's lower 6 rows and BG0's), which turn 2.4 and
 * 3.2 times as fast; each colored by its palette line in the scene's colors; and where along a course its set, mode and
 * scene change and over what length, each found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { type SkyBand, type SkyBands } from '../shared/sky-baking.js';
import { rgb555Of } from '../taito/palette.js';
import { bottomLayer, TILE, tilePen, TRANSPARENT_PEN } from '../taito/tc0100scn.js';
import type { ChaseHqRecord } from './chase-hq-road.js';

/** A band's columns, and the far band's pixels a turn. */
export const SKY_COLUMNS = 96;
export const SKY_TURN = SKY_COLUMNS * TILE;
/**
 * The nearer bands' turns over the far band's: their turn tables' 384/g and 512/g over its 160/g (K, 2026-11-08), BG1's
 * lower rows by the first and BG0's by the second, the two swapped in mode 4 (0x62E4).
 */
export const NEARER_TURNS = Object.freeze({ lower: 2.4, near: 3.2 });
/** Where a band's bottom row lies against the horizon on level road, the first row below it 0: BG1's row r at r − 183. */
const rowBelow = (row: number) => row - 183;
/** The far band's pixel at the screen's middle at the stage's start, heading 0, where the road vanishes (column 175). */
export const SKY_MIDDLE = 175;
/** The far band's pixel behind the start's heading, where a nearer band's turn has its seam (K, 2026-11-08). */
export const SKY_SEAM = SKY_MIDDLE + SKY_TURN / 2;

const long = (high: number, low: number) => high * 0x10000 + low;

/** A band's row: its tile code's address in each column, and its palette line. */
interface BandRow {
  readonly code: (column: number) => number;
  readonly line: number;
}

/**
 * The main program's tables: its control word 6 (0x15E); its palette's entry 0, the last of the words read back from
 * 0x2DED2 (0x69C, 0x6AC); its background setup's tables from 0xD0A2 (0x5FFA): BG0's band from 0 (0x6048) and BG1's lower
 * from 0x480 (0x6062), 0x900 bytes a mode (0x607A), 12 bytes a column (0x6224); the far band from 0x2D00, 0xD80 bytes a
 * set (0x60A4, 0x60BC), 36 bytes a column; in mode 4 BG1's rows 18 to 21 the lower band's words 0 to 3 in the far band's
 * line (0x60E0, 0x62B2) and its rows 22 and 23 its words 4 and 5 (0x6162); the bands' palette lines by mode or set
 * (0x604C, 0x6066, 0x60A8); the scenes' colors from 0x2EEE6 (0xEA6), 16 words a line, 16 lines a set's, set 2's lines
 * from 0x18 on 0x50 lines on (0xE8E, 0xE96); the modes of a record's background byte (0x5FA6), mode 4 taking set 1
 * (0x5FBA).
 */
function tables(main: Uint8Array) {
  const at = <const E extends readonly (number | null)[]>(address: number, words: E, what: string) =>
    instruction(main, address, words, `the background's ${what}`);
  const [control6] = at(0x15e, [0x33fc, null, 0x00c2, 0x000c], 'control word 6 (move.w)');
  const paletteEnd = long(...at(0x69c, [0x227c, null, null], 'palette load (movea.l)'));
  const [paletteLast] = at(0x6ac, [0x303c, null], 'palette count (move.w)');
  const base = long(...at(0x5ffa, [0x287c, null, null], 'setup tables (movea.l)'));
  at(0x6048, [0x43ec, 0x0000], "BG0's band (lea)");
  const [lower] = at(0x6062, [0x43ec, null], "BG1's lower band (lea)");
  const [modeStride] = at(0x607a, [0x343c, null], "a mode's bytes (move.w)");
  const [nearColumn] = at(0x6224, [0xc0fc, null], "a nearer band's column (mulu.w)");
  const [lowerFour] = at(0x6162, [0x43ec, null], "BG1's lower rows in mode 4 (lea)");
  at(0x60e0, [0x0c6d, 0x0004, 0x829c], "mode 4's rows over the far band's (cmpi.w #4)");
  at(0x62b2, [0x0c6d, 0x0004, 0x829c], "mode 4's rows streamed with the far band's (cmpi.w #4)");
  at(0x62e4, [0x0c6d, 0x0004, 0x829c], "mode 4's nearer turns swapped (cmpi.w #4)");
  const [far] = at(0x60a4, [0x43ec, null], "far band's sets (lea)");
  const [setStride] = at(0x60bc, [0x343c, null], "a set's bytes (move.w)");
  const [farColumn] = at(0x6284, [0xc0fc, null], "the far band's column (mulu.w)");
  const nearLines = long(...at(0x604c, [0x247c, null, null], "BG0's lines (movea.l)"));
  const lowerLines = long(...at(0x6066, [0x247c, null, null], "BG1's lower lines (movea.l)"));
  const farLines = long(...at(0x60a8, [0x247c, null, null], "far band's lines (movea.l)"));
  const colors = long(...at(0xea6, [0x207c, null, null], "scenes' colors (movea.l)"));
  at(0xe8e, [0x0c6d, 0x0002, 0x82a4], "set 2's colors (cmpi.w #2)");
  const [setTwoLines] = at(0xe96, [0x0642, null], "set 2's colors' offset (addi.w)");
  const modes = long(...at(0x5fa6, [0x207c, null, null], 'modes (movea.l)'));
  at(0x5fba, [0x0c40, 0x0004], 'mode 4 taking set 1 (cmpi.w #4)');
  const rowOf = (from: number, stride: number, word0: number, line: number): BandRow => ({
    code: (column) => from + column * stride + 2 * word0,
    line,
  });
  const lowerAt = (mode: number) => base + lower + mode * modeStride;
  return {
    control6,
    black: rgb555Of(word(main, paletteEnd - 2 * (paletteLast + 1))),
    far: (set: number, mode: number): BandRow[] => {
      const line = word(main, farLines + 2 * set);
      const rows = Array.from({ length: 18 }, (_, r) => rowOf(base + far + set * setStride, farColumn, r, line));
      return mode === 4 ? [...rows, ...[0, 1, 2, 3].map((r) => rowOf(lowerAt(4), nearColumn, r, line))] : rows;
    },
    lower: (mode: number): BandRow[] => {
      const line = word(main, lowerLines + 2 * mode);
      return mode === 4
        ? [0, 1].map((r) => rowOf(base + lowerFour + 4 * modeStride, nearColumn, r, line))
        : Array.from({ length: 6 }, (_, r) => rowOf(lowerAt(mode), nearColumn, r, line));
    },
    near: (mode: number): BandRow[] =>
      Array.from({ length: 6 }, (_, r) =>
        rowOf(base + mode * modeStride, nearColumn, r, word(main, nearLines + 2 * mode)),
      ),
    colors: (line: number, scene: number, set: number) =>
      colors + 32 * ((line - 0x10) * 16 + scene + (set === 2 && line >= 0x18 ? setTwoLines : 0)),
    modes,
  };
}

/** A band's pixels (RGB555, row by row, 768 a row), its rows' colors in scene `scene`, its pen 0 transparent unless opaque. */
function bandPixels(
  main: Uint8Array,
  gfx: Uint8Array,
  rows: readonly BandRow[],
  colorsOf: (line: number) => readonly number[],
  opaque: boolean,
) {
  const pixels = new Int32Array(SKY_TURN * rows.length * TILE);
  rows.forEach((band, row) => {
    const colors = colorsOf(band.line);
    for (let column = 0; column < SKY_COLUMNS; column++) {
      const code = word(main, band.code(column));
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const pen = tilePen(gfx, code, x, y);
          pixels[(row * TILE + y) * SKY_TURN + column * TILE + x] =
            pen === TRANSPARENT_PEN && !opaque ? -1 : colors[pen]!;
        }
    }
  });
  return pixels;
}

/**
 * The sky of far set `set`, background mode `mode` and scene `scene`, tiles from graphics `gfx`: its layers in the
 * order the chip draws them (BG1's far band and lower rows, its bottom layer, then BG0's band over them), the far band
 * facing, each nearer band's seam behind the start's heading; black (the palette's entry 0) where no band lies.
 */
export function chaseHqSky(main: Uint8Array, gfx: Uint8Array, set: number, mode: number, scene: number): SkyBands {
  const t = tables(main);
  if (bottomLayer(t.control6) !== 1)
    throw romDiffers('CHASE H.Q. draws its BG0 at the bottom, which its skies do not read');
  const colorsOf = (line: number) => {
    const at = t.colors(line, scene, set);
    return Array.from({ length: 16 }, (_, k) => rgb555Of(word(main, at + 2 * k)));
  };
  const [far, lower, near] = [t.far(set, mode), t.lower(mode), t.near(mode)];
  const turns = mode === 4 ? { lower: NEARER_TURNS.near, near: NEARER_TURNS.lower } : NEARER_TURNS;
  const band = (rows: readonly BandRow[], opaque: boolean, bottomRow: number, turn?: number): SkyBand => ({
    width: SKY_TURN,
    pixels: bandPixels(main, gfx, rows, colorsOf, opaque),
    bottom: rowBelow(bottomRow),
    ...(turn === undefined ? {} : { turn: SKY_TURN * turn, overlap: 0 }),
  });
  return {
    layers: [
      band(far, true, far.length * TILE - 1),
      band(lower, true, 191, turns.lower),
      band(near, false, 191, turns.near),
    ],
    facing: 0,
    seam: SKY_SEAM,
    ramp: { rows: [t.black], below: t.black },
  };
}

/** A record's background mode (its byte 6 through the modes' table), null where it sets none. */
export const backgroundMode = (main: Uint8Array, record: ChaseHqRecord) =>
  record.background === 0 ? null : word(main, tables(main).modes + 2 * record.background);

/** The ticks a scene's fade takes at most: 13 lines, 3 every 4th frame (0xED0, 0xE72). */
export const SCENE_FADE_TICKS = 20;

/** Where a course's sky or colors change: at its record, its far set, mode, scene and road palette, over its length. */
export interface SkyChange {
  readonly record: number;
  readonly set: number;
  readonly mode: number;
  readonly scene: number;
  readonly palette: number;
  /** Ticks from where the original begins the change to where it has made it all, 0 at once. */
  readonly ticks: number;
}

/**
 * The changes along a course's records (each with its mode, null where its byte 6 sets none, its scene and its road
 * palette entry), from its first: where the original picks the far set at random (a mode but 4), the stage's set
 * `randomSet` (K, 2026-11-08), mode 4 set 1; each record whose set, mode, scene or road palette differs from the one
 * before, the scene fading in 20 ticks at most (13 lines, 3 every 4th frame) and the road palette `steps` ticks.
 */
export function skyChanges(
  records: readonly { readonly mode: number | null; readonly scene: number; readonly palette: number }[],
  randomSet: number,
  steps: (from: number, to: number) => number,
): SkyChange[] {
  const out: SkyChange[] = [];
  let last: SkyChange | null = null;
  records.forEach((r, record) => {
    const mode = r.mode ?? last?.mode;
    if (mode === undefined) throw romDiffers("A course's first record sets no background");
    const set = r.mode === null ? last!.set : mode === 4 ? 1 : randomSet;
    if (last && set === last.set && mode === last.mode && r.scene === last.scene && r.palette === last.palette) return;
    const ticks = last
      ? Math.max(
          r.scene !== last.scene ? SCENE_FADE_TICKS : 0,
          r.palette !== last.palette ? steps(last.palette, r.palette) : 0,
        )
      : 0;
    last = { record, set, mode, scene: r.scene, palette: r.palette, ticks };
    out.push(last);
  });
  return out;
}

/**
 * The ticks the road palette takes from colors `from` to colors `to` (its 4 words, RGB555): every 4th frame a step of
 * each channel toward the new (0xF80), 4 ticks a step of the largest channel's change at most.
 */
export function paletteTicks(from: readonly number[], to: readonly number[]) {
  const channel = (c: number, k: number) => (c >> (5 * k)) & 31;
  let most = 0;
  from.forEach((c, i) =>
    [0, 1, 2].forEach((k) => (most = Math.max(most, Math.abs(channel(c, k) - channel(to[i]!, k))))),
  );
  return 4 * most;
}
