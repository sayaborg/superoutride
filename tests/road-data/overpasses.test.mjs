import assert from 'node:assert/strict';
import test from 'node:test';
import { crossings } from '../../tools/road-data/shared/overpasses.ts';

test('a plan crossing itself gives its two passages once, where its line meets', () => {
  // 400 m east, a left turn of 270° at 100 m radius, then south: it meets its first straight 300 m from its start.
  const arc = (3 * Math.PI) / 2;
  const pieces = [
    { length: 400, turn: 0 },
    { length: 100 * arc, turn: arc },
    { length: 300, turn: 0 },
  ];
  // A step of 0.7 m, so that the crossing lies within a stretch: two stretches meeting at their ends only touch.
  const found = crossings(pieces, 400 + 100 * arc + 300, 0.7);
  assert.equal(found.length, 1);
  assert.ok(Math.abs(found[0][0] - 300) < 1e-6);
  assert.ok(Math.abs(found[0][1] - (400 + 100 * arc + 100)) < 1e-6);
  // Short of the second passage there is none.
  assert.equal(crossings(pieces, 400 + 100 * arc + 50, 0.7).length, 0);
});
