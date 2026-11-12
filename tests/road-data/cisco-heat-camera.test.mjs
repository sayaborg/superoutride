import assert from 'node:assert/strict';
import test from 'node:test';
import { ciscoHeatCamera, depthPinhole } from '../../tools/road-data/cisco-heat/cisco-heat-camera.ts';

/** A road CPU's program with its rows' depths at the addresses CISCO HEAT's first has: a pinhole's, rounded. */
function program(rows, behind, count = 92) {
  const road = new Uint8Array(0x4000);
  const put = (at, words) => words.forEach((w, i) => ((road[at + 2 * i] = w >> 8), (road[at + 2 * i + 1] = w & 0xff)));
  put(0x2a66, [0x47f9, 0, 0x3232]); // lea.l $3232, a3
  put(0x2a72, [0x7e00 | (count - 1)]); // moveq #count - 1, d7
  put(
    0x3232,
    Array.from({ length: count }, (_, k) => Math.round((behind * k) / (rows - k))),
  );
  return road;
}

test("its rows' depths are read as the pinhole they are drawn from, its camera that pinhole at this game's focal length", () => {
  const road = program(92.7, 374.5);
  const { rows, behind } = depthPinhole(road);
  assert.ok(Math.abs(rows - 92.7) < 0.01 && Math.abs(behind - 374.5) < 0.1);
  const metres = 1.75 / 108;
  const camera = ciscoHeatCamera(road, metres);
  assert.equal(camera.tilts, true);
  assert.equal(camera.focal, 240);
  assert.ok(Math.abs(camera.behind - behind * metres) < 1e-12);
  // Its eye as high as the pinhole's: the nearest row's rows × its depth, at this game's focal length on 224 rows.
  assert.ok(Math.abs(camera.eye - (rows * behind * metres) / (240 * (224 / 240))) < 1e-12);
});

test("depths that are no pinhole's, or a program that differs, are refused", () => {
  const road = program(92.7, 374.5);
  road[0x3232 + 2 * 40 + 1] += 5;
  assert.throws(() => depthPinhole(road), /pinhole/);
  const other = program(92.7, 374.5);
  other[0x2a66] = 0x41;
  assert.throws(() => depthPinhole(other), /lea/);
});
