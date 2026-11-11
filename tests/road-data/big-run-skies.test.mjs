import assert from 'node:assert/strict';
import test from 'node:test';
import { rgb555Of } from '../../tools/road-data/jaleco/palette.ts';
import { tilePen } from '../../tools/road-data/jaleco/ms1-tiles.ts';
import { boardScenes, boardSky, scenePicture, SKY_MIDDLE, skyRamp } from '../../tools/road-data/jaleco/ms1-skies.ts';
import { BIG_RUN_SKIES } from '../../tools/road-data/big-run/big-run-backgrounds.ts';

const PLANE_TURN = BIG_RUN_SKIES.turn;
const bigRunScenes = (main, plane, stage) => boardScenes(main, BIG_RUN_SKIES, plane, stage);
import { TRANSPARENT } from '../../tools/road-data/shared/sky-baking.ts';

test('a palette word is each channel’s four high bits then its low bit, put in RGB555’s places', () => {
  // Red 0b10101, green 0b01110, blue 0b11001: RRRR 1010, GGGG 0111, BBBB 1100, R 1, G 0, B 1, x.
  const word = (0b1010 << 12) | (0b0111 << 8) | (0b1100 << 4) | (1 << 3) | (0 << 2) | (1 << 1);
  assert.equal(rgb555Of(word), (0b10101 << 10) | (0b01110 << 5) | 0b11001);
});

test("a 16 × 16 tile is four 8 × 8 tiles, the left column's upper and lower, then the right's, high nibble first", () => {
  const rom = new Uint8Array(32 * 8);
  // Tile 1's four small tiles are 4 to 7: each one's first byte its pens 1 and 2 plus its order.
  for (let k = 0; k < 4; k++) rom[(4 + k) * 32] = ((k + 1) << 4) | (k + 2);
  assert.deepEqual(
    [
      [0, 0],
      [0, 8],
      [8, 0],
      [8, 8],
    ].map(([x, y]) => tilePen(rom, 1, x, y)),
    [1, 2, 3, 4],
  );
  assert.equal(tilePen(rom, 1, 1, 0), 2);
  assert.throws(() => tilePen(rom, 2, 0, 0), /past the tile ROM/);
});

/** A main program with a stage's scenes for plane 1 and the road layers' palette, at the addresses BIG RUN's has. */
function program({ start = 1000, y = -32, entries = 1 } = {}) {
  const main = new Uint8Array(0x140000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  const long = (at, v) => put(at, [v >>> 16, v & 0xffff]);
  // lea $8c3e(pc), a0 at 0x8e20; addi.l #$26, $6(a6) at 0x8ec8; lea $8c56(pc), a0 at 0x9274; addi.l #$28 at 0x92f6.
  put(0x8e20, [0x41fa, 0x8c3e - 0x8e22]);
  put(0x8ec8, [0x06ae, 0x0000, 0x0026, 0x0006]);
  put(0x9274, [0x41fa, (0x8c56 - 0x9276) & 0xffff]);
  put(0x92f6, [0x06ae, 0x0000, 0x0028, 0x0006]);
  // Stage 0's plane 0 scenes at 0x21000: none; its plane 1 scenes at 0x20000: one record, then the end.
  long(0x8c56, 0x21000);
  long(0x21000, 0xffffffff);
  long(0x8c3e, 0x20000);
  long(0x20000, start);
  long(0x20004, 0x30000); // its columns: two of one row each, 4 bytes apart
  put(0x20008, [y & 0xffff, 4, 0]); // its row offset, stride 4, one row (+C 0)
  long(0x2000e, 0x94000 + 2 * 14); // to the plane's row 14
  long(0x20016, 0x30004);
  long(0x20020, 0x31000); // its palette
  put(0x20024, [entries]);
  long(0x20026, 0xffffffff);
  put(0x30000, [0x0001, 0x0001]); // tile 1, entry 0, in both columns
  put(0x31000 + 2 * 3, [0xf000]); // entry 0's pen 3: red 30, green 0, blue 0
  return main;
}

test("a plane's scenes are its table's records, each its columns, place, row offset and palette", () => {
  const [scene, ...rest] = bigRunScenes(program(), 1, 0);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    [scene.start, scene.stride, scene.rows, scene.top, scene.y, scene.palette, scene.entries],
    [1000, 4, 1, 14, -32, 0x31000, 1],
  );
  assert.equal(bigRunScenes(program(), 0, 0).length, 0);
});

test("a scene's picture is its columns side by side, its bottom row its offset below the horizon less 240", () => {
  const main = program();
  const tiles = new Uint8Array(32 * 8);
  tiles[4 * 32] = 0x3f; // tile 1's top-left pixel pen 3, the next pen 15 (not drawn)
  const [scene] = bigRunScenes(main, 1, 0);
  const picture = scenePicture(main, BIG_RUN_SKIES, tiles, scene);
  assert.equal(picture.width, 32);
  assert.equal(picture.pixels.length, 32 * 15 * 16);
  // Row 14's first pixel row, column 0: pen 3 in entry 0, then pen 15 transparent.
  const at = 14 * 16 * 32;
  assert.equal(picture.pixels[at], 30 << 10);
  assert.equal(picture.pixels[at + 1], TRANSPARENT);
  assert.equal(picture.pixels[0], TRANSPARENT); // above its first row
  assert.equal(picture.bottom, 15 * 16 - -32 - 240);
  assert.equal(picture.turn, PLANE_TURN[1]);
  // A tile taking an entry the scene loads none of is refused.
  const none = program({ entries: 0 });
  assert.throws(
    () => scenePicture(none, BIG_RUN_SKIES, tiles, bigRunScenes(none, 1, 0)[0]),
    /entry 0 it loads none of/,
  );
});

test("the sky's ramp is the road layer's rows, a line's band one pen of its entry; the back plane faces", () => {
  const main = program();
  // A road layer's palette: entry 25's pens 0 and 5.
  const palette = Array.from({ length: 64 }, () => new Array(16).fill(0));
  palette[25][0] = rgb555Of(0x00f0);
  palette[25][5] = rgb555Of(0x0f00);
  const road = new Uint8Array(0x10000);
  const put = (at, words) => words.forEach((w, i) => ((road[at + 2 * i] = w >> 8), (road[at + 2 * i + 1] = w & 0xff)));
  put(0xeb8, [0x43f9, 0x0000, 0x5000]);
  // Row 0: line 0, scroll 0 (pen 0); row 1: line 1, scroll 256 (pen 5); entry 25.
  put(0x5000, [0, 0, 25, 1, 256, 25]);
  for (let k = 2; k < 224; k++) put(0x5000 + 6 * k, [0, 0, 25]);
  const ramp = skyRamp(road, BIG_RUN_SKIES, palette);
  assert.equal(ramp.rows.length, 224);
  assert.deepEqual([ramp.rows[0], ramp.rows[1]], [(0 << 10) | (0 << 5) | 30, (0 << 10) | (30 << 5) | 0]);
  assert.equal(ramp.below, ramp.rows[0]);
  put(0x5000, [4, 0, 25]);
  assert.throws(() => skyRamp(road, BIG_RUN_SKIES, palette), /no single color/);
  put(0x5000, [0, 0, 25]);
  const sky = boardSky(
    main,
    BIG_RUN_SKIES,
    [new Uint8Array(1024), new Uint8Array(1024)],
    road,
    palette,
    undefined,
    undefined,
  );
  assert.equal(sky.facing, 0);
  assert.equal(sky.layers[1].overlap, SKY_MIDDLE - (SKY_MIDDLE * PLANE_TURN[0]) / PLANE_TURN[1]);
});
