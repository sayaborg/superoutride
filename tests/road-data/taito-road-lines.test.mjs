import assert from 'node:assert/strict';
import test from 'node:test';
import { edgePens, roadLines } from '../../tools/road-data/taito/tc0150rod.ts';

test("a road tile's two lines read their pens from little-endian words, the edges outward from the middle", () => {
  // Tile 1 of a made-up ROM: its edge line's word 63 (pixels 504 to 511) and word 64 (512 to 519).
  const rom = new Uint8Array(0x400);
  const word = (w, low, high) => rom.set([low, high], 0x200 + 2 * w);
  word(63, 0b00000011, 0b00000001); // pixel 510: pen 1 (its low bit); pixel 511: pen 3 (both bits)
  word(64, 0b10000000, 0b11000000); // pixel 512: pen 3; pixel 513: pen 2
  const { edge, body } = roadLines(rom, 1);
  assert.equal(edge.length, 1024);
  assert.equal(body.length, 1024);
  assert.deepEqual([edge[510], edge[511], edge[512], edge[513]], [1, 3, 3, 2]);
  assert.deepEqual(edgePens(edge, -1), [3, 1]);
  assert.deepEqual(edgePens(edge, 1), [3, 2]);
  assert.throws(() => roadLines(rom, 2));
});
