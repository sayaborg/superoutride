import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ciscoHeatHeld,
  positionMetres,
  speedometerKmh,
  stageCheckpoint,
  stageGoal,
} from '../../tools/road-data/cisco-heat/cisco-heat-road.ts';

/** A main program with its lists of the roads at the addresses CISCO HEAT's has: stage 1's road 1 list given. */
function program(records) {
  const main = new Uint8Array(0x10000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  const long = (at, v) => put(at, [v >>> 16, v & 0xffff]);
  put(0x220e, [0x41fa, 0x900 - 0x2210]); // lea $900(pc), a0
  put(0x221e, [0xe940]); // asl.w #4, d0
  put(0x5d92, [0x2d58, 0x0058, 0x2d50, 0x005c]); // move.l (a0)+, $58(a6); move.l (a0), $5c(a6)
  put(0x7718, [0x206e, 0x0058, 0x3028, 0x0008, 0x0800, 0x0001]); // movea.l $58(a6), a0; move.w 8(a0), d0; btst #1
  long(0x900 + 16 + 8, 0x4000); // stage 1's road 1 list
  long(0x900 + 16 + 12, 0x5000); // and its road 2 list: none
  records.forEach(([end, flags], k) => {
    long(0x4000 + 20 * k + 4, end);
    put(0x4000 + 20 * k + 8, [flags]);
  });
  return main;
}

test('a road list record with flag bit 1 holds the car from the record before to its end, a record ending at 0 first passed', () => {
  const main = program([
    [0, 0],
    [1000, 0],
    [2000, 2],
    [3000, 2],
    [4000, 0],
    [3500, 0],
  ]);
  assert.deepEqual(ciscoHeatHeld(main, 1), [{ road: 1, from: 1000, to: 3000 }]);
  assert.throws(() => ciscoHeatHeld(main, 5), RangeError);
  main[0x221e] = 0;
  assert.throws(() => ciscoHeatHeld(main, 1), /asl/);
});

/** A main program with its speedometer, its stages' goals and checkpoints, at the addresses CISCO HEAT's has. */
function stagesProgram({ top = 0xa00000, shown = [2, 8, 0], goals, checkpoints }) {
  const main = new Uint8Array(0x20000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  const long = (at, v) => put(at, [v >>> 16, v & 0xffff]);
  put(0x15cca, [0x0c80, top >>> 16, top & 0xffff]); // cmpi.l #top, d0
  put(0x15cda, [0xd080, 0xd080, 0x4840]); // add.l d0, d0; add.l d0, d0; swap d0
  put(0x15d0c, [0x49f9, 0, 0x3b00]); // lea.l $3b00, a4
  // The digits at its top's index, a blank 0 and digit k 4(k + 1).
  put(
    0x3b00 + 6 * Math.floor((4 * top) / 0x10000),
    shown.map((k) => (k === null ? 0 : 4 * (k + 1))),
  );
  put(0x224e, [0x41fa, 0x900 - 0x2250]); // lea $900(pc), a0
  put(0x2254, [0x23f0, 0x1000, 0x000f, 0x0234]); // move.l (a0, d1.w), $f0234
  put(0x225c, [0x41fa, 0x980 - 0x225e]); // lea $980(pc), a0
  put(0x2262, [0x23f0, 0x1000, 0x000f, 0x0250]); // move.l (a0, d1.w), $f0250
  put(0x17b44, [0x2239, 0x000f, 0x02c0, 0xb2b9, 0x000f, 0x0234]); // move.l $f02c0, d1; cmp.l $f0234, d1
  goals.forEach((g, k) => long(0x900 + 4 * k, g));
  checkpoints.forEach((c, k) => long(0x980 + 4 * k, c));
  return main;
}

const GOALS = [350000, 600000, 600000, 600000, 600000];

test("a speed unit shows its top's speed over its top, and gains a position a tick of 1/30 s", () => {
  const main = stagesProgram({ goals: GOALS, checkpoints: GOALS });
  assert.equal(speedometerKmh(main), 280 / 160);
  assert.ok(Math.abs(positionMetres(main) - 1.75 / 108) < 1e-15);
  // A blank digit leads; another top reads its own index.
  const slow = stagesProgram({ top: 0x400000, shown: [null, 9, 6], goals: GOALS, checkpoints: GOALS });
  assert.equal(speedometerKmh(slow), 96 / 64);
  slow[0x15cdb] = 0x81;
  assert.throws(() => speedometerKmh(slow), /add\.l/);
});

test("a stage's goal and checkpoint are its main program's, a checkpoint past the goal none", () => {
  const main = stagesProgram({ goals: GOALS, checkpoints: [800000, 356136, 312237, 251000, 336000] });
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((s) => [stageGoal(main, s), stageCheckpoint(main, s)]),
    [
      [350000, null],
      [600000, 356136],
      [600000, 312237],
      [600000, 251000],
      [600000, 336000],
    ],
  );
  assert.throws(() => stageGoal(main, 5), RangeError);
  main[0x17b4b] = 0x50;
  assert.throws(() => stageGoal(main, 0), /cmp\.l/);
});
