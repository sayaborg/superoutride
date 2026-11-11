import assert from 'node:assert/strict';
import test from 'node:test';
import { ciscoHeatHeld } from '../../tools/road-data/cisco-heat/cisco-heat-road.ts';

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
