import assert from 'node:assert/strict';
import test from 'node:test';
import { laneWidths } from '../../tools/road-data/shared/lane-mask.ts';

/** Six slots a to f, bits 6 to 1, P between c and d, 3.6 m a slot. */
const SLOTS = { names: ['a', 'b', 'c', 'd', 'e', 'f'], bits: [6, 5, 4, 3, 2, 1], centre: 3, width: 3.6 };
/** Each change's stretch ending at its record, of one length whatever it moves. */
const ENDING = { ...SLOTS, placement: 'ending', perLane: false };
/** Each change's stretch starting at its record, a side's edge taking its length a lane. */
const STARTING = { ...SLOTS, placement: 'starting', perLane: true };

const near = (a, b) => Math.abs(a - b) < 1e-9;
/** Each lane's width at `station`, from the piece holding it. */
const at = (lanes, station) =>
  Object.fromEntries(lanes.map(({ lane, pieces }) => [lane, pieces.findLast((p) => p.from <= station).width(station)]));

test("a mask's lanes are its set slots, each a slot's width, P between the slots it names", () => {
  assert.deepEqual(at(laneWidths(ENDING, 0, 0x7c, [], []), 0), { a: 3.6, b: 3.6, c: 3.6, d: 3.6, e: 3.6, f: 0 });
  assert.deepEqual(at(laneWidths(ENDING, 0, 0x0e, [], []), 0), { a: 0, b: 0, c: 0, d: 3.6, e: 3.6, f: 3.6 });
});

test("a change takes its original's stretch, each lane changing as the side's edge crosses it", () => {
  // Two lanes open on the right ending at 100 m over 12.3 m: e over its first half, f over its second.
  const ending = laneWidths(ENDING, 0, 0x18, [{ mask: 0x1e, at: 100, length: 12.3 }], []);
  const before = at(ending, 87.7);
  const middle = at(ending, 100 - 12.3 / 2);
  const after = at(ending, 100);
  assert.ok(before.e === 0 && before.f === 0);
  assert.ok(near(middle.e, 3.6) && near(middle.f, 0));
  assert.ok(near(after.e, 3.6) && near(after.f, 3.6));
  // The same change starting at 100 m, 28.4 m a lane: e from 100 m to 128.4 m, f to 156.8 m; d stays.
  const starting = laneWidths(STARTING, 0, 0x18, [{ mask: 0x1e, at: 100, length: 28.4 }], []);
  assert.ok(near(at(starting, 128.4).e, 3.6) && near(at(starting, 128.4).f, 0));
  assert.ok(near(at(starting, 128.4 + 14.2).f, 1.8), 'a lane is half open half way across it');
  assert.ok(near(at(starting, 156.8).f, 3.6) && at(starting, 156.8).d === 3.6);
});

test('a change of no length jumps at a Section cut, and inside a Section stops the conversion', () => {
  const lanes = laneWidths(ENDING, 0, 0x7c, [{ mask: 0x0e, at: 200, length: 0 }], [200]);
  const a = lanes.find((l) => l.lane === 'a').pieces;
  assert.deepEqual(
    a.map((p) => p.from),
    [0, 200],
  );
  assert.deepEqual([a[0].width(199.9), a[1].width(200)], [3.6, 0]);
  assert.throws(() => laneWidths(ENDING, 0, 0x7c, [{ mask: 0x0e, at: 150, length: 0 }], [200]), /inside a Section/);
});

test('a mask setting a lane beyond one it does not stops the conversion', () => {
  assert.throws(() => laneWidths(ENDING, 0, 0x5c, [], []), /beyond one it does not/);
});

test("a side's edge still moving turns toward a newer change's lanes from where it stands", () => {
  // Three right lanes close from 100 m, 28.4 m a lane; at 150 m, 1.76 lanes on, the mask asks for one lane again.
  const lanes = laneWidths(
    STARTING,
    0,
    0x0e,
    [
      { mask: 0x00, at: 100, length: 28.4 },
      { mask: 0x08, at: 150, length: 28.4 },
    ],
    [],
  );
  const stands = 3 - 50 / 28.4;
  assert.ok(near(at(lanes, 150).e, 3.6 * (stands - 1)), 'lane e is part open where the edge turns');
  assert.equal(at(lanes, 150).f, 0);
  // From 1.24 lanes back to 1: lane e closes over the next 0.24 lane's length and d stays open.
  const back = 150 + 28.4 * (stands - 1);
  assert.ok(near(at(lanes, back).e, 0) && near(at(lanes, back).d, 3.6));
  assert.ok(near(at(lanes, 400).d, 3.6) && at(lanes, 400).e === 0);
});
