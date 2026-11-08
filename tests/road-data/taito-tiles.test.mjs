import assert from 'node:assert/strict';
import test from 'node:test';
import { tileGraphics, tilePen } from '../../tools/road-data/taito/tc0100scn.ts';

test("a tile's pixels are 4 bits each, the left one in a byte's high nibble, the ROM's words' bytes swapped", () => {
  const rom = new Uint8Array(64);
  // Tile 1's first row as the chip reads it: pens 1 2 3 4 5 6 7 8; the ROM holds each word's bytes swapped.
  [0x12, 0x34, 0x56, 0x78].forEach((b, k) => (rom[32 + (k ^ 1)] = b));
  rom[32 + 31] = 0xf0; // its last row's last pair, read as byte 30: pens 15 and 0 of pixels 4 and 5
  const gfx = tileGraphics(rom);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, x) => tilePen(gfx, 1, x, 0)),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual([tilePen(gfx, 1, 4, 7), tilePen(gfx, 1, 5, 7)], [15, 0]);
  assert.throws(() => tilePen(gfx, 2, 0, 0), /past the tile ROM/);
});
