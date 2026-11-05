/**
 * FINAL LAP 2's skies ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#its-skies)): its back layer,
 * face 0's picture and ground as the master lays them, and its front, face 1's band in the columns of K's arrangement
 * (`final-lap-2-fronts.json`), each in its course's colors, laid as the course's sky.
 */
import { readFileSync } from 'node:fs';
import { requireInput } from '../../authoring/authoring-error.js';
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { bakeSky, TRANSPARENT, type SkyLayer } from '../shared/sky-baking.js';
import { PIXEL_ASPECT } from '../namco-system-2/display.js';
import { HIDDEN, LAYER_TILE, layerColors, layerTilePixels } from '../namco-system-2/tiles.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { inData, long, readPaletteLoad } from './final-lap-2-road.js';
import { BACK_REPEATS, BACK_ROWS, COURSE_IDS, FRONT_COLUMNS, FRONT_ROWS } from './final-lap-2-constants.js';

/** A layer's tile map: 64 tiles a row, 64 rows, a word a tile. */
const MAP_TILES = 64;
const MAP_ROW_BYTES = 2 * MAP_TILES;
const MAP_PIXELS = MAP_TILES * LAYER_TILE;
/** The back layer's pixels a turn: its picture's `BACK_REPEATS` times. */
export const BACK_WIDTH = MAP_PIXELS * BACK_REPEATS;
/** A section's list among a block's first 16 words; a list's end. */
const SECTIONS = 16;
const LIST_END = 0xffff;

const FRONTS_FILE = '/tools/road-data/final-lap-2/final-lap-2-fronts.json';

/** A piece of a front: its section's columns at indices `first` to `last`. */
type Piece = readonly [section: number, first: number, last: number];

let fronts: ReadonlyMap<string, readonly Piece[]> | undefined;

/** K's arrangement, admitted once: its shape, the four courses and each piece three integers, first ≤ last. */
function readFronts(): ReadonlyMap<string, readonly Piece[]> {
  const document: unknown = JSON.parse(readFileSync(new URL('./final-lap-2-fronts.json', import.meta.url), 'utf8'));
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  requireInput(isRecord(document) && isRecord(document.courses), FRONTS_FILE, 'Its shape: its courses');
  const courses = document.courses;
  const names = Object.keys(courses);
  requireInput(
    names.length === COURSE_IDS.length && COURSE_IDS.every((id) => names.includes(id)),
    `${FRONTS_FILE}/courses`,
    `Exactly the courses ${COURSE_IDS.join(', ')}`,
  );
  return new Map(
    COURSE_IDS.map((id) => {
      const pieces = courses[id];
      requireInput(Array.isArray(pieces), `${FRONTS_FILE}/courses/${id}`, "A course's pieces");
      return [
        id,
        Object.freeze(
          pieces.map((piece: unknown, k) => {
            requireInput(
              Array.isArray(piece) &&
                piece.length === 3 &&
                piece.every((v) => Number.isInteger(v)) &&
                (piece[1] as number) <= (piece[2] as number),
              `${FRONTS_FILE}/courses/${id}/${k}`,
              'A piece: its section, first and last, integers, first ≤ last',
            );
            return Object.freeze([piece[0], piece[1], piece[2]] as const) as Piece;
          }),
        ),
      ] as const;
    }),
  );
}

/** A course's colors, `register`'s 256 from the race's palette set for course `c` (the master's 0x52A8). */
function layerPalette(p: FinalLap2, c: number, register: number): number[] {
  const [set] = instruction(
    p.master,
    0x52a8,
    [0x3039, 0x0040, 0xd000, 0x0240, 0x0003, 0x0640, null, 0x6100, 0xe492],
    "the race's palette set",
  );
  instruction(p.master, 0x3750, [0x4bf9, 0x0000, 0x37d4], "the palette sets' lists");
  return readPaletteLoad(p, long(p.master, 0x37d4 + 8 * (c + set!) + 4), layerColors(register));
}

/** A layer's pixels from tile words, `words[row][column]`, in `colors`: RGB555, or `TRANSPARENT` where hidden. */
function layerPixels(p: FinalLap2, words: readonly (readonly number[])[], colors: readonly number[]): Int32Array {
  const width = words[0]!.length * LAYER_TILE;
  const pixels = new Int32Array(width * words.length * LAYER_TILE);
  const tiles = new Map<number, Int16Array>();
  words.forEach((row, r) =>
    row.forEach((w, column) => {
      let tile = tiles.get(w);
      if (!tile) tiles.set(w, (tile = layerTilePixels(p.characters, p.tileMask, w)));
      for (let y = 0; y < LAYER_TILE; y++)
        for (let x = 0; x < LAYER_TILE; x++) {
          const pen = tile[y * LAYER_TILE + x]!;
          pixels[(r * LAYER_TILE + y) * width + column * LAYER_TILE + x] = pen === HIDDEN ? TRANSPARENT : colors[pen]!;
        }
    }),
  );
  return pixels;
}

/**
 * The back layer's tile words: face 0 as the master's 0x2E1E lays it, its picture's rows 60 to 63 and 0 to 13 a run
 * of tiles from course c's first (its table at 0x2F3C), 64 a row, then rows 14 to 27 one tile each, the codes that
 * follow; and its color register (its 0x2E80).
 */
function backWords(p: FinalLap2, c: number) {
  const [register] = instruction(p.master, 0x2e80, [0x33fc, null, 0x0042, 0x0030], "face 0's colors");
  instruction(p.master, 0x2ee0, [0x303b, 0x005a], "face 0's first tiles");
  const [pictureFirst, pictureWords] = instruction(
    p.master,
    0x2ee4,
    [0x41f9, 0x0040, null, 0x3e3c, null],
    "face 0's picture from row 60",
  );
  const [restWords] = instruction(p.master, 0x2ef6, [0x41f9, 0x0040, 0x0000, 0x3e3c, null], "face 0's picture on");
  const [groundRows, groundColumns] = instruction(
    p.master,
    0x2f08,
    [0x3e3c, null, 0x323c, null, 0x30c0],
    "face 0's ground",
  );
  const { first, picture, ground } = BACK_ROWS;
  if (
    pictureFirst! !== first * MAP_ROW_BYTES ||
    pictureWords! + 1 + restWords! + 1 !== picture * MAP_TILES ||
    groundRows! + 1 !== ground ||
    groundColumns! + 1 !== MAP_TILES
  )
    throw romDiffers("Face 0's rows are not `BACK_ROWS`");
  const start = word(p.master, 0x2f3c + 2 * c);
  const rows = Array.from({ length: picture }, (_, r) =>
    Array.from({ length: MAP_TILES }, (_, x) => start + MAP_TILES * r + x),
  );
  for (let r = 0; r < ground; r++) rows.push(new Array<number>(MAP_TILES).fill(start + MAP_TILES * picture + r));
  return { rows, register: register! };
}

/**
 * The front band's columns: course c's pieces of K's arrangement, each column's id the word at its section's list's
 * index (the slave's 0x2030: its block of lists for the course from its 0xB016, a section's list at its offset among the
 * block's first 16 words), its tile words from 0x212000 + 16 × the id, a word a row of face 1's rows 8 to 15; and face
 * 1's color register (the master's 0x2E90). A piece's section must be one of the 16 and its words within the block's
 * lists, none their end; the course's pieces 192 columns.
 */
function frontWords(p: FinalLap2, c: number) {
  const [register] = instruction(p.master, 0x2e90, [0x33fc, null, 0x0042, 0x0032], "face 1's colors");
  const [tableHigh, tableLow] = instruction(p.slave, 0x2030, [0x41f9, null, null], "the front's lists");
  const [columnsHigh, columnsLow, rowAt] = instruction(
    p.slave,
    0x2064,
    [0x41f9, null, null, 0x0280, 0x0000, 0xffff, 0xe988, 0xd1c0, 0x43f9, 0x0040, null],
    "a front column's tiles",
  );
  const [rows, stride] = instruction(p.slave, 0x2088, [null, 0x3298, 0xd2fc, null], "a front column's rows");
  if (rowAt! !== 0x2000 + FRONT_ROWS.first * MAP_ROW_BYTES || rows! !== 0x7e00 + FRONT_ROWS.count - 1)
    throw romDiffers("Face 1's band is not `FRONT_ROWS`");
  if (stride! !== MAP_ROW_BYTES) throw romDiffers("A front column's rows are not a map row apart");
  const block = inData(p, long(p.slave, ((tableHigh! << 16) | tableLow!) + 4 * c));
  const columns = inData(p, (columnsHigh! << 16) | columnsLow!);
  const offsets = Array.from({ length: SECTIONS }, (_, k) => word(p.data, block + 2 * k));
  // The lists lie from the offsets' end to the last list's end.
  let end = block + Math.max(...offsets);
  while (word(p.data, end) !== LIST_END) end += 2;
  const id = COURSE_IDS[c]!;
  fronts ??= readFronts();
  const pieces = fronts.get(id)!;
  const ids = pieces.flatMap(([section, first, last], k) => {
    const at = `${FRONTS_FILE}/courses/${id}/${k}`;
    requireInput(section >= 0 && section < SECTIONS, at, `A section among the course's ${SECTIONS}`);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const address = block + offsets[section]! + 2 * (first + i);
      requireInput(
        address >= block + 2 * SECTIONS && address < end && word(p.data, address) !== LIST_END,
        at,
        `Index ${first + i} of section ${section} lies within the course's lists`,
      );
      return word(p.data, address);
    });
  });
  requireInput(ids.length === FRONT_COLUMNS, `${FRONTS_FILE}/courses/${id}`, `${FRONT_COLUMNS} columns a turn`);
  const words = Array.from({ length: FRONT_ROWS.count }, (_, r) =>
    ids.map((column) => word(p.data, columns + 16 * column + 2 * r)),
  );
  return { rows: words, register: register! };
}

/**
 * Where the front's bottom row lies, rows below the horizon: the master's 0x65A6 sets face 1's y scroll 0xF0 less the
 * horizon's row and face 0's one more, MONACO's (course 1) face 1 sixteen more than the others', so that, the two
 * layers' display offsets the same, the band's top lies (its first row less the picture's, in pixels, plus face 0's y
 * less face 1's) below the picture's top, the picture's last row the last above the horizon.
 */
function frontBottom(p: FinalLap2, c: number): number {
  const [monaco, monacoMore] = instruction(
    p.master,
    0x65b4,
    [
      0x0640,
      0x00f0,
      0x33c0,
      0x0040,
      0x9026,
      0x5240,
      0x33c0,
      0x0040,
      0x9022,
      0x0c79,
      null,
      0x0040,
      0xd000,
      0x660a,
      0x0640,
      null,
    ],
    "the faces' y scrolls",
  );
  // Face 1's y less face 0's: −1, or MONACO's face 0's + 0xF.
  const later = c === monaco! ? monacoMore! : -1;
  const top = ((((FRONT_ROWS.first - BACK_ROWS.first) * LAYER_TILE - later) % MAP_PIXELS) + MAP_PIXELS) % MAP_PIXELS;
  return top + FRONT_ROWS.count * LAYER_TILE - 1 - BACK_ROWS.picture * LAYER_TILE;
}

/** One color of `pixels`' row `row` (of `width`), which must be one color, the ramp's. */
function rowColor(pixels: Int32Array, width: number, row: number, what: string): number {
  const color = pixels[row * width]!;
  for (let x = 0; x < width; x++)
    if (pixels[row * width + x] !== color || color === TRANSPARENT) throw romDiffers(`${what} is not one color`);
  return color;
}

/**
 * Course c's ground's color: its back layer's last row's, one color, which its sky's ramp takes below the back layer
 * and its ground beyond the road's picture takes (K, 2026-11-05).
 */
export function groundColor(p: FinalLap2, c: number): number {
  const back = backWords(p, c);
  const pixels = layerPixels(p, back.rows, layerPalette(p, c, back.register));
  return rowColor(pixels, MAP_PIXELS, back.rows.length * LAYER_TILE - 1, "The ground's last row");
}

/**
 * Course c's sky `name`: its back layer, face 0's picture and ground three times a turn, its bottom row the ground's
 * last; its front, face 1's band in K's arrangement's 192 columns a turn, its pixel 0 over the back's; over the
 * picture's top row's color above it and below the back layer its last row's.
 */
export function finalLap2Sky(p: FinalLap2, c: number, name: string) {
  const back = backWords(p, c);
  const front = frontWords(p, c);
  const backTile = layerPixels(p, back.rows, layerPalette(p, c, back.register));
  const backWidth = BACK_WIDTH;
  const height = back.rows.length * LAYER_TILE;
  const backPixels = new Int32Array(backWidth * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < backWidth; x++) backPixels[y * backWidth + x] = backTile[y * MAP_PIXELS + (x % MAP_PIXELS)]!;
  const backLayer: SkyLayer = {
    width: backWidth,
    pixels: backPixels,
    bottom: BACK_ROWS.ground * LAYER_TILE - 1,
  };
  const frontLayer: SkyLayer = {
    width: FRONT_COLUMNS * LAYER_TILE,
    pixels: layerPixels(p, front.rows, layerPalette(p, c, front.register)),
    bottom: frontBottom(p, c),
  };
  const ramp = {
    rows: [rowColor(backPixels, backWidth, 0, "The picture's top row")],
    below: groundColor(p, c),
  };
  return bakeSky(name, { back: backLayer, front: frontLayer, overlap: 0, ramp }, PIXEL_ASPECT);
}
