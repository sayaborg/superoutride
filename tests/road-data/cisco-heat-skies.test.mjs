import assert from 'node:assert/strict';
import test from 'node:test';
import { planeTurns, TURN_RADIUS } from '../../tools/road-data/cisco-heat/cisco-heat-backgrounds.ts';
import { scenePicture } from '../../tools/road-data/jaleco/ms1-skies.ts';
import { TRANSPARENT } from '../../tools/road-data/shared/sky-baking.ts';

/** A main program with the planes' slide, its last index and the top speed, at the addresses CISCO HEAT's has. */
function program({ top = 0xa00000, last = 220, limit = 0xfdb19 } = {}) {
  const main = new Uint8Array(0x10000);
  const put = (at, words) => words.forEach((w, i) => ((main[at + 2 * i] = w >> 8), (main[at + 2 * i + 1] = w & 0xff)));
  put(0x31b8, [0x243c, top >>> 16, top & 0xffff]); // move.l #top, d2
  put(0xa474, [0x0c41, last]); // cmpi.w #last, d1
  put(0xa486, [0x43fa, 0xb000 - 0xa488]); // lea $b000(pc), a1
  put(0xa7ba, [0xe240]); // asr.w #1, d0
  // Every index of the slide's table: a rate, then the limit.
  for (let index = 0; index <= last + 1; index++) put(0xb000 + 8 * index + 4, [limit >>> 16, limit & 0xffff]);
  return main;
}

test("a plane turns as far as it slides while the car turns through the radius's curve at its top speed", () => {
  // The limit 15.86 pixels a frame: the front 15 one way and 16 the other, the back 7 and 8; 160 units a frame.
  const [back, front] = planeTurns(program());
  assert.ok(Math.abs(front - (2 * Math.PI * 15.5 * TURN_RADIUS) / 160) < 1e-9);
  assert.ok(Math.abs(back - (2 * Math.PI * 7.5 * TURN_RADIUS) / 160) < 1e-9);
  // A limit of whole pixels slides as far each way: 4 and 2 pixels at 64 units.
  const [slowBack, slowFront] = planeTurns(program({ top: 0x400000, limit: 0x40000 }));
  assert.ok(Math.abs(slowFront - (2 * Math.PI * 4 * TURN_RADIUS) / 64) < 1e-9);
  assert.ok(Math.abs(slowBack - (2 * Math.PI * 2 * TURN_RADIUS) / 64) < 1e-9);
  // A program whose instructions differ is refused.
  const other = program();
  other[0xa7ba] = 0;
  assert.throws(() => planeTurns(other), /asr/);
});

test('a scene whose columns are 0xFFFFFFFF clears its plane: no picture', () => {
  const board = {
    scenes: [0, 0],
    sizes: [0, 0],
    planeRam: [0xa0000, 0xa8000],
    turn: [1000, 2000],
    rows: 0,
  };
  const scene = {
    plane: 1,
    start: 0,
    from: 0xffffffff,
    to: 0xffffffff,
    stride: 0,
    rows: 1,
    top: 0,
    y: 0,
    palette: 0,
    entries: 0,
  };
  const picture = scenePicture(new Uint8Array(0), board, new Uint8Array(0), scene);
  assert.deepEqual([picture.width, [...picture.pixels], picture.turn], [1, [TRANSPARENT], 2000]);
});
