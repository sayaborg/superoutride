import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestLine } from '../../tools/road-data/cisco-heat/cisco-heat-road-picture.ts';

/** A road CPU program with its line kinds at the addresses CISCO HEAT's has: kind 2 line 0, kind 0x14 line 2041. */
function program() {
  const road = new Uint8Array(0x4000);
  const put = (at, words) => words.forEach((w, i) => ((road[at + 2 * i] = w >> 8), (road[at + 2 * i + 1] = w & 0xff)));
  put(0x1990, [0x41fa, 0x3000 - 0x1992, 0x4e71, 0x3a30, 0x0000]); // lea $3000(pc), a0; nop; move.w (a0, d0.w), d5
  put(0x199a, [0x0c40, 0x0014, 0x6400, 0x0006, 0x0645, 0x0126]); // cmpi.w #$14, d0; bcc; addi.w #$126, d5
  put(0x3000 + 2, [0]);
  put(0x3000 + 0x14, [2041]);
  put(0x3000 + 0x16, [2048]);
  return road;
}

test("a kind's nearest line is its table's word, 294 more for a picture of many lines", () => {
  const road = program();
  assert.equal(nearestLine(road, 2), 294);
  assert.equal(nearestLine(road, 0x14), 2041);
  assert.throws(() => nearestLine(road, 0x16), /past the road ROMs/);
  road[0x199d] = 0x16;
  assert.throws(() => nearestLine(road, 2), /many lines below kind 22/);
});
