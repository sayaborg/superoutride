import assert from 'node:assert/strict';
import test from 'node:test';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import {
  createPlanCoordinateSample,
  createPlanProjectionWorkspace,
} from '../../src/course/geometry/plan-coordinate.js';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('arc projection is independent of accumulated heading winding', () => {
  const plan = compilePlanPath(
    { x: 0, z: 0, heading: 0 },
    Array.from({ length: 6 }, (_, index) => ({
      id: `half-turn-${index}`,
      kind: 'arc',
      radius: 100,
      turn: 180,
    })),
  );
  const reader = createPlanCoordinateReader(plan.primitives, plan.length, (_s, out) =>
    Object.assign(out, { left: -10, right: 10 }),
  );
  const primitive = plan.primitives.at(-1);
  const s = primitive.sStart + (primitive.sEnd - primitive.sStart) * 0.37;
  const point = reader.toWorld(s, 2, createPlanCoordinateSample());
  const projected = reader.locateLocal(
    point,
    point.seed,
    0,
    { s: 0, l: 0, seed: -1, distanceSquared: 0 },
    createPlanProjectionWorkspace(),
  );

  near(projected.s, s);
  near(projected.l, 2);
  assert.equal(projected.seed, point.seed);
  assert.ok(Math.abs(point.heading) <= Math.PI);
});
