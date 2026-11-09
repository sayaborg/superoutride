/**
 * TOP SPEED's sprites ([TOP SPEED road data](../../../docs/top-speed-road-data.md#its-sprites), its hardware as MAME's
 * driver describes it): a sprite is a big sprite of 8 × 16 tiles of 16 × 8 pixels at 4 bits a pixel, pen 0 not drawn,
 * laid by the sprite map, RAM the main program fills at its start from a run-length code (M 0x13AC, from M 0x82000)
 * and overlays as a thing's load record names (M 0x91F4); its tiles from the sixteen OBJ ROMs, each a byte of every 8
 * in its half of the tiles: a tile is 64 bytes, a row 8, its four bit planes 16 bits apart in the row, the first the
 * pen's highest bit, a pixel's bits the highest first. At its full size a big sprite is 128 × 128 pixels.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { RomSet } from '../shared/rom-set.js';

/** The OBJ ROMs, by the byte of every 8 each fills in the tiles' first half and in their second (MAME's `topspeed`). */
export const TOP_SPEED_OBJ_ROMS = Object.freeze([
  [
    { name: 'b14-38.5', size: 0x20000, crc: 0xde0c213e },
    { name: 'b14-36.13', size: 0x20000, crc: 0x20a7c1b8 },
    { name: 'b14-42.6', size: 0x20000, crc: 0xab51f53c },
    { name: 'b14-40.14', size: 0x20000, crc: 0xfa2a3cb3 },
    { name: 'b14-46.7', size: 0x20000, crc: 0xd489adf2 },
    { name: 'b14-44.15', size: 0x20000, crc: 0x9f6c030e },
    { name: 'b14-50.8', size: 0x20000, crc: 0xec1ef311 },
    { name: 'b14-48.16', size: 0x20000, crc: 0x30c7f265 },
  ],
  [
    { name: 'b14-39.1', size: 0x20000, crc: 0x798c28c5 },
    { name: 'b14-37.9', size: 0x20000, crc: 0x801b703b },
    { name: 'b14-43.2', size: 0x20000, crc: 0x1e6d2b38 },
    { name: 'b14-41.10', size: 0x20000, crc: 0x09455a14 },
    { name: 'b14-47.3', size: 0x20000, crc: 0xb3a1f75b },
    { name: 'b14-45.11', size: 0x20000, crc: 0x63e4ce03 },
    { name: 'b14-51.4', size: 0x20000, crc: 0x35041c5f },
    { name: 'b14-49.12', size: 0x20000, crc: 0x32ba4265 },
  ],
] as const);

/** A big sprite's pixels across and down at its full size, a tile's, and a tile's bytes and a row's. */
export const BIG_SPRITE = 128;
const TILE_WIDTH = 16;
const TILE_HEIGHT = 8;
const TILE_BYTES = 64;
const ROW_BYTES = 8;
/** A big sprite's words in the sprite map: its tiles, 8 a row. */
const MAP_WORDS = (BIG_SPRITE / TILE_WIDTH) * (BIG_SPRITE / TILE_HEIGHT);
/** The sprite map's words. */
const MAP_SIZE = 0x8000;

/** The sprites' tiles as the chip reads them: each half of them its eight ROMs, a byte of every 8 each. */
export function assembleTopSpeedSprites(set: RomSet): Uint8Array {
  const half = TOP_SPEED_OBJ_ROMS[0]![0]!.size * ROW_BYTES;
  const out = new Uint8Array(2 * half);
  TOP_SPEED_OBJ_ROMS.forEach((roms, h) =>
    roms.forEach((rom, k) => {
      const data = set.data(rom);
      for (let i = 0; i < data.length; i++) out[h * half + ROW_BYTES * i + k] = data[i]!;
    }),
  );
  return out;
}

/** The pen of tile `code`'s pixel at `x` (0 to 15), `y` (0 to 7), in the sprites' tiles `gfx`. */
export function topSpeedTilePen(gfx: Uint8Array, code: number, x: number, y: number): number {
  const row = code * TILE_BYTES + y * ROW_BYTES;
  if (row + ROW_BYTES > gfx.length) throw romDiffers(`Sprite tile 0x${code.toString(16)} lies past its ROMs`);
  let pen = 0;
  for (let plane = 0; plane < 4; plane++) {
    const bit = plane * 16 + x;
    pen |= ((gfx[row + (bit >> 3)]! >> (7 - (bit & 7))) & 1) << (3 - plane);
  }
  return pen;
}

/**
 * Words decoded by the program's run-length code from `at` in `main` into `out` from `to`: a word with bit 15 clear is a
 * word; any other is its low 15 bits repeated by the next word, n, ((n − 1) & 7) + 1 times, twice where n equals it
 * (M 0x13BC to 0x13DE, M 0x1374 to 0x139A); to its end mark, 0xFFFF (M 0x13C0), or `count` words (M 0x1370).
 */
function decodeRuns(main: Uint8Array, at: number, out: Uint16Array, to: number, count?: number) {
  let [src, dst] = [at, to];
  const end = count === undefined ? out.length : to + count;
  while (dst < end) {
    const w = word(main, src);
    src += 2;
    if (count === undefined && w === 0xffff) return;
    if (!(w & 0x8000)) {
      out[dst++] = w;
      continue;
    }
    const n = word(main, src);
    src += 2;
    const times = (((n === w ? 2 : n) - 1) & 7) + 1;
    for (let k = 0; k < times && dst < end; k++) out[dst++] = w & 0x7fff;
  }
  if (count === undefined) throw romDiffers("The sprite map's runs pass its RAM");
}

/**
 * The sprite map as the main program fills it at its start (M 0x13AC: the runs at the table its `lea` names into the
 * map's RAM, 0xE00000), then with each of the load records `loads` (their addresses in the sub program, a descriptor's
 * long at 0xA, S 0x6CB0): its pairs (byte 3, S 0x6CD0) from 4, each a source in the main program's space and a big
 * sprite's place in the map's RAM, whose 128 words the main program decodes (M 0x91F4, M 0x1370).
 */
export function topSpeedSpriteMap(main: Uint8Array, sub: Uint8Array, loads: readonly number[] = []): Uint16Array {
  const [high, low] = instruction(
    main,
    0x13ac,
    [0x41f9, null, null, 0x43f9, 0x00e0, 0x0000],
    "the sprite map's runs (lea)",
  );
  instruction(main, 0x1370, [0x363c, MAP_WORDS], "a big sprite's words (move.w #$80)");
  instruction(sub, 0x6cb0, [0x246a, 0x000a], "a descriptor's load record (movea.l $a(a2))");
  instruction(sub, 0x6cd0, [0x1a2a, 0x0003], 'its pairs (move.b $3(a2))');
  const map = new Uint16Array(MAP_SIZE);
  decodeRuns(main, high * 0x10000 + low, map, 0);
  for (const record of loads)
    for (let k = 0; k < sub[record + 3]!; k++) {
      const pair = record + 4 + 8 * k;
      const src = word(sub, pair) * 0x10000 + word(sub, pair + 2);
      const dst = word(sub, pair + 4) * 0x10000 + word(sub, pair + 6) - 0xe00000;
      if (dst < 0 || dst % (2 * MAP_WORDS) || dst >= 2 * MAP_SIZE)
        throw romDiffers('A load record names no big sprite');
      decodeRuns(main, src, map, dst / 2, MAP_WORDS);
    }
  return map;
}

/** Big sprite `sprite`'s picture at its full size, 128 × 128 pens row by row, from tiles `gfx` and sprite map `map`. */
export function topSpeedBigSprite(gfx: Uint8Array, map: Uint16Array, sprite: number): Uint8Array {
  const pens = new Uint8Array(BIG_SPRITE * BIG_SPRITE);
  const tiles = gfx.length / TILE_BYTES;
  for (let j = 0; j < BIG_SPRITE / TILE_HEIGHT; j++)
    for (let k = 0; k < BIG_SPRITE / TILE_WIDTH; k++) {
      const code = map[sprite * MAP_WORDS + j * (BIG_SPRITE / TILE_WIDTH) + k]! % tiles;
      for (let y = 0; y < TILE_HEIGHT; y++)
        for (let x = 0; x < TILE_WIDTH; x++)
          pens[(j * TILE_HEIGHT + y) * BIG_SPRITE + k * TILE_WIDTH + x] = topSpeedTilePen(gfx, code, x, y);
    }
  return pens;
}
