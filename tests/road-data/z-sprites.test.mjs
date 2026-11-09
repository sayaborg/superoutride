import assert from 'node:assert/strict';
import test from 'node:test';
import { zBigSprite, zSpriteGraphics, zTilePen } from '../../tools/road-data/taito/z-sprites.ts';

/** Four ROMs of one tile (128 bytes each laid as 16 rows of a 16-bit word a ROM): ROM k's word for row y is `word(k, y)`. */
const roms = (word) =>
  [0, 1, 2, 3].map((k) => {
    const rom = new Uint8Array(32);
    for (let y = 0; y < 16; y++) {
      const w = word(k, y);
      // The word as the ROM holds it, its bytes swapped from the chip's order.
      rom[2 * y] = w & 0xff;
      rom[2 * y + 1] = w >> 8;
    }
    return rom;
  });

test("a sprite tile's pen takes a bit from each ROM, the first ROM's the highest, the leftmost pixel its top bit", () => {
  // Row 0: ROM 0 sets pixel 0, ROM 3 sets pixel 0 and pixel 15; row 5: ROM 1 sets pixel 7.
  const gfx = zSpriteGraphics(
    roms((k, y) => (y === 0 && k === 0 ? 0x8000 : y === 0 && k === 3 ? 0x8001 : y === 5 && k === 1 ? 0x0100 : 0)),
  );
  assert.equal(zTilePen(gfx, 0, 0, 0), 0b1001);
  assert.equal(zTilePen(gfx, 0, 15, 0), 0b0001);
  assert.equal(zTilePen(gfx, 0, 7, 5), 0b0100);
  assert.equal(zTilePen(gfx, 0, 1, 0), 0);
});

test('a big sprite lays its 8 × 8 chunks by the spritemap, a chunk it leaves out pen 0', () => {
  const gfx = zSpriteGraphics(roms((k) => (k === 0 ? 0xffff : 0)));
  // Sprite 1's map: its first chunk tile 0, the rest none (0xFFFF).
  const map = new Uint8Array(2 * 128).fill(0xff);
  map[128] = 0;
  map[129] = 0;
  const pens = zBigSprite(gfx, map, 1);
  assert.equal(pens[0], 8);
  assert.equal(pens[15 * 128 + 15], 8);
  assert.equal(pens[16], 0);
  assert.equal(pens[16 * 128], 0);
});
