/**
 * BIG RUN's skies ([Original road data](../../../docs/original-road-data.md#sky-baking), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-skies)): its two tile planes over its road layer's sky rows, each plane's
 * scenes along the road a picture of columns of 16 × 16 tiles its program streams as it turns, colored by the scene's
 * palette; the back plane (plane 0) facing the sky; the sky's rows above the horizon the road layer's, a color each; each
 * table found by the instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { SkyBand, SkyBands } from '../shared/sky-baking.js';
import { TRANSPARENT } from '../shared/sky-baking.js';
import { CLEAR_PEN, TILE, tileOf, tilePen } from '../jaleco/ms1-tiles.js';
import { paletteEntry } from '../jaleco/palette.js';

/** The back plane (0) and the front plane (1), in the order the board draws them. */
export type Plane = 0 | 1;
/** Each plane's tile words' RAM, a column of 16 tiles 16 words (MAME's description). */
const PLANE_RAM = [0x90000, 0x94000] as const;
const COLUMN_TILES = 16;
/** The stages. */
export const STAGES = 6;

/**
 * The pixels each plane turns a turn: the front 12 a degree, the back 8, as the program's turn records give them a degree
 * of the road's arcs (M 0x7358, each record's +6 the front's and +8 the back's), 2.8125 pictures each.
 */
export const PLANE_TURN = [2880, 4320] as const;
/**
 * The picture's pixel at the screen's middle column as a scene is loaded: its first columns written from the plane's
 * first, its horizontal scroll 8 (M 0x8EDE, 0x930C), the screen 256 pixels wide: 8 + 128. Every plane faces it where it
 * is loaded.
 */
export const SKY_MIDDLE = 8 + 128;
/** The back plane's pixel behind the facing, where a plane turning no whole number of its pictures has its seam. */
export const SKY_SEAM = SKY_MIDDLE + PLANE_TURN[0] / 2;
/**
 * The screen's first row below the horizon less a scene's row offset: a plane's pixel row Y shows at screen row
 * Y − (y + h), the road's h rows above its last line (239) at the horizon, so a scene's bottom pixel row lies
 * Y + 1 − y − 240 rows below its first row below the horizon, whatever h.
 */
const BELOW = 240;

/** A plane's scene: from road position `start`, its picture's tile columns, their place in the plane and its palette. */
export interface BigRunScene {
  readonly plane: Plane;
  readonly start: number;
  /** Its columns' tile words from `from` to `to` (M), `stride` bytes a column, `rows` tile words each. */
  readonly from: number;
  readonly to: number;
  readonly stride: number;
  readonly rows: number;
  /** The plane's tile row its first word goes to, and its row offset (the plane's scroll less the road's horizon). */
  readonly top: number;
  readonly y: number;
  /** Its palette words (M) and their entries, loaded to the plane's first. */
  readonly palette: number;
  readonly entries: number;
}

/** Each plane's scenes table and its records' size, as its program reads them (M 0x8E20, 0x9274; 0x8EC8, 0x92F6). */
function sceneTable(main: Uint8Array, plane: Plane) {
  const [lea, step] = plane === 1 ? [0x8e20, 0x8ec8] : [0x9274, 0x92f6];
  const [disp] = instruction(main, lea, [0x41fa, null], "a plane's scenes (lea pc)");
  const [size] = instruction(main, step, [0x06ae, 0x0000, null, 0x0006], "a scene's record's size (addi.l)");
  return { at: lea + 2 + ((disp << 16) >> 16), size };
}

/**
 * Plane `plane`'s scenes in stage `stage`, in their order, each from its start to the next's: a record's start (+0), its
 * columns (+4 to +16, +A bytes a column, +C + 1 tile words), where they go (+E) and its row offset (+8), its palette (+20)
 * and its entries (+24), the table ending at a start no later than the one before.
 */
export function bigRunScenes(main: Uint8Array, plane: Plane, stage: number): BigRunScene[] {
  const { at, size } = sceneTable(main, plane);
  const first = long(main, at + 4 * stage);
  const out: BigRunScene[] = [];
  for (let r = first; ; r += size) {
    const start = long(main, r);
    if (start === 0xffffffff || (out.length > 0 && start <= out.at(-1)!.start)) break;
    const dest = long(main, r + 0xe) - PLANE_RAM[plane];
    out.push({
      plane,
      start,
      from: long(main, r + 4),
      to: long(main, r + 0x16),
      stride: word(main, r + 0xa),
      rows: word(main, r + 0xc) + 1,
      top: (dest / 2) % COLUMN_TILES,
      y: sword(main, r + 8),
      palette: long(main, r + 0x20),
      entries: word(main, r + 0x24),
    });
  }
  return out;
}

/**
 * A scene's picture as the sky lays it: its tile columns side by side, its rows from the plane's first, the tiles' pens
 * in their palette entries' RGB555 (`TRANSPARENT` at pen 15 and above its first row), its bottom row's place below the
 * horizon, and its plane's turn.
 */
export function scenePicture(main: Uint8Array, tiles: Uint8Array, scene: BigRunScene): SkyBand {
  const columns = (scene.to - scene.from) / scene.stride + 1;
  if (!Number.isInteger(columns)) throw romDiffers(`A scene's columns at 0x${scene.from.toString(16)} are not whole`);
  const height = (scene.top + scene.rows) * TILE;
  const width = columns * TILE;
  const pixels = new Int32Array(width * height).fill(TRANSPARENT);
  const palettes = Array.from({ length: scene.entries }, (_, e) => paletteEntry(main, scene.palette, e));
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < scene.rows; r++) {
      const { tile, entry } = tileOf(word(main, scene.from + c * scene.stride + 2 * r));
      const colors = palettes[entry];
      if (!colors)
        throw romDiffers(`A scene's tile at 0x${scene.from.toString(16)} takes entry ${entry} it loads none of`);
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const pen = tilePen(tiles, tile, x, y);
          if (pen !== CLEAR_PEN) pixels[((scene.top + r) * TILE + y) * width + c * TILE + x] = colors[pen]!;
        }
    }
  }
  return { width, pixels, bottom: height - scene.y - BELOW, turn: PLANE_TURN[scene.plane] };
}

/** The road layer's palette words as the program loads them (M 0x176A), both road layers' alike. */
const roadPalette = (main: Uint8Array) => {
  const [high, low] = instruction(main, 0x176a, [0x41f9, null, null], "the road layers' palette (lea)");
  return high * 0x10000 + low;
};

/** The road layer's rows above the horizon, from the second road CPU's table of them (R2 0xEB8): a line, scroll, entry. */
const SKY_ROWS = 224;
const LINE_BANDS = 4;
const BAND = 256;

/**
 * The sky's ramp: each row up from the horizon the road layer's color there, its line (0 to 3) four bands of 256 pixels,
 * each one pen of its entry (the line's bands its pens 4 × line to 4 × line + 3), its scroll choosing the band; the color
 * below the horizon its first row's.
 */
export function skyRamp(main: Uint8Array, road: Uint8Array): SkyBands['ramp'] {
  const [high, low] = instruction(road, 0xeb8, [0x43f9, null, null], "the sky's rows (lea)");
  const at = high * 0x10000 + low;
  const palette = roadPalette(main);
  const rows = Array.from({ length: SKY_ROWS }, (_, k) => {
    const [line, scroll, entry] = [word(road, at + 6 * k), word(road, at + 6 * k + 2), word(road, at + 6 * k + 4)];
    if (line >= LINE_BANDS || scroll % BAND !== 0) throw romDiffers(`The sky's row ${k} draws no single color`);
    return paletteEntry(main, palette, entry & 0x3f)[LINE_BANDS * line + scroll / BAND]!;
  });
  return { rows, below: rows[0]! };
}

/**
 * The sky of the back plane's scene `back` and the front plane's `front` (either absent where its plane shows none), over
 * the ramp: the back plane facing, the front's pixel f over the back's f × (the back's turn ÷ the front's) + the overlap
 * at which both face `SKY_MIDDLE`, as the program loads them; each laid round from the back plane's `SKY_SEAM`.
 */
export function bigRunSky(
  main: Uint8Array,
  tiles: readonly [Uint8Array, Uint8Array],
  road: Uint8Array,
  back: BigRunScene | undefined,
  front: BigRunScene | undefined,
): SkyBands {
  const ramp = skyRamp(main, road);
  const none = (plane: Plane): SkyBand => ({
    width: 1,
    pixels: new Int32Array([TRANSPARENT]),
    bottom: 0,
    turn: PLANE_TURN[plane],
  });
  const layers = [
    back ? scenePicture(main, tiles[0], back) : none(0),
    {
      ...(front ? scenePicture(main, tiles[1], front) : none(1)),
      overlap: SKY_MIDDLE - (SKY_MIDDLE * PLANE_TURN[0]) / PLANE_TURN[1],
    },
  ];
  return { layers, facing: 0, seam: SKY_SEAM, ramp };
}
