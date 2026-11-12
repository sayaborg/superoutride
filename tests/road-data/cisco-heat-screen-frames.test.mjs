import assert from 'node:assert/strict';
import test from 'node:test';
import { readCiscoHeatScreen, rowsAt } from '../../tools/road-data/cisco-heat/cisco-heat-screen-frames.ts';

/** A road CPU's program with its rows' depths and scales at the addresses CISCO HEAT's first has. */
function program() {
  const road = new Uint8Array(0x4000);
  const put = (at, words) => words.forEach((w, i) => ((road[at + 2 * i] = w >> 8), (road[at + 2 * i + 1] = w & 0xff)));
  put(0x19f0, [0x47f9, 0, 0x3234]); // lea.l $3234, a3
  put(0x19f6, [0x7e5a]); // moveq #$5a, d7
  put(0x2136, [0xc3f9, 0x000c, 0x0052]); // muls.w $c0052, d1
  put(0x2142, [0xc5f9, 0x000c, 0x0050]); // muls.w $c0050, d2
  put(0x216a, [0xc5eb, 0x00b8]); // muls.w $b8(a3), d2
  put(
    0x3234,
    Array.from({ length: 91 }, (_, k) => Math.round((374.5 * (k + 1)) / (92.7 - (k + 1)))),
  );
  put(
    0x3234 + 0xb8,
    Array.from({ length: 91 }, (_, k) => Math.round(16384 - 165.5 * (k + 1))),
  );
  return road;
}

/** A road at `angle` radians up everywhere but where `hill(s)` adds height. */
const road = (angle, hill = () => 0) => ({
  height: (s) => Math.sin(angle) * s + hill(s),
  angle: () => angle,
  run: (s) => Math.cos(angle) * s,
  departure: 0,
});

test("its rows lie as its level road's where the road keeps its grade, the camera tilting with it", () => {
  const screen = readCiscoHeatScreen(program());
  const level = Array.from({ length: 91 }, (_, k) => 223 - (k + 1));
  assert.deepEqual(Array.from(rowsAt(screen, road(0), 5000)), level);
  // A long uniform grade: within a row of the level road's at every depth, its rounding.
  const graded = rowsAt(screen, road(0.2), 5000);
  assert.ok(graded.every((r, k) => Math.abs(r - level[k]) <= 1));
});

test("a rise ahead raises each row by its height above the car's at the row's scale", () => {
  const screen = readCiscoHeatScreen(program());
  const rise = 100;
  const rows = rowsAt(
    screen,
    road(0, (s) => (s > 6000 ? rise : 0)),
    5000,
  );
  rows.forEach((r, k) => {
    const up = screen.depths[k] > 1000 ? Math.floor((rise * screen.scales[k]) / 16384) : 0;
    assert.equal(r, 223 - (k + 1) - up);
  });
  const other = program();
  other[0x19f7] = 0x5b;
  assert.throws(() => readCiscoHeatScreen(other), /moveq/);
});
