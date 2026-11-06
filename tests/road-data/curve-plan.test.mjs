import assert from 'node:assert/strict';
import test from 'node:test';
import { skyTurnPlan } from '../../tools/road-data/shared/curve-plan.ts';

const LENGTH = 24.576;

test("a road's plan turns as its farthest sky layer does: a turn's pixels a full turn", () => {
  // 128 intervals of 8 pixels on a 1,024-pixel turn: one full turn, left, its radius the arc's length over 2π.
  const [arc] = skyTurnPlan(new Array(128).fill(8), LENGTH, 1024, 1);
  assert.ok(Math.abs(arc.turn - 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs(arc.length / arc.turn - (128 * LENGTH) / (2 * Math.PI)) < 1e-9);
  const [right] = skyTurnPlan([8], LENGTH, 1024, -1);
  assert.ok(Math.abs(right.turn + (2 * Math.PI) / 128) < 1e-12, 'a sign of −1 turns a positive value right');
});

test("a road's table is not read round: its end and its start stay apart", () => {
  const pieces = skyTurnPlan([5, 0, 0, 5], LENGTH, 768, 1);
  assert.deepEqual(
    pieces.map((p) => p.length),
    [LENGTH, 2 * LENGTH, LENGTH],
  );
});
