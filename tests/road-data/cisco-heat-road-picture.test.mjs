import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ciscoHeatLanePicture,
  ciscoHeatPaints,
  nearestLine,
} from '../../tools/road-data/cisco-heat/cisco-heat-road-picture.ts';
import { lanesOverTwoRoads } from '../../tools/road-data/shared/two-roads.ts';

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

/** Road ROMs whose line 294 is a road of four lanes as CISCO HEAT's: runs `[from, to, pen]` across its 1,024 pixels. */
function roms() {
  const rom = new Uint8Array(2048 * 512).fill(0xff);
  const runs = [
    [-512, -408, 0],
    [-408, -312, 1],
    [-312, -280, 3],
    [-280, -264, 6],
    [-264, -252, 7],
    [-252, -148, 6],
    [-148, -136, 8],
    [-136, -6, 6],
    [-6, 6, 8],
    [6, 136, 6],
    [136, 148, 8],
    [148, 252, 6],
    [252, 264, 9],
    [264, 280, 6],
    [280, 312, 10],
    [312, 408, 1],
    [408, 512, 0],
  ];
  for (const [from, to, pen] of runs)
    for (let x = from + 512; x < to + 512; x++) {
      const at = 294 * 512 + (x >> 1);
      rom[at] = x & 1 ? (rom[at] & 0xf0) | pen : (rom[at] & 0x0f) | (pen << 4);
    }
  return rom;
}

test('its surface is the pen its runs cover most, the run at its centre a lane line; its lanes four', () => {
  const runs = ciscoHeatPaints(roms(), 294);
  const paintAt = (x) => runs.find((r) => r.from <= x && r.to > x).paint;
  assert.deepEqual([0, 100, 142, 258, 300, 400, 500].map(paintAt), [
    'line',
    'surface',
    'line',
    'line',
    'edge',
    'edge',
    'outside',
  ]);
  const lanes = lanesOverTwoRoads(ciscoHeatLanePicture(program(), roms()));
  assert.deepEqual(lanes.lanes(0), { a: 116, b: 142, c: 0, m: 0, d: 0, e: 142, f: 116 });
  assert.deepEqual(lanes.breaks, [142, 408, 558]);
});
