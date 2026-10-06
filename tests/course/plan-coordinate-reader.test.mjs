import assert from 'node:assert/strict';
import test from 'node:test';
import { compileCourseGeometry } from '../../src/course/course-geometry.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import {
  createPlanCoordinateSample,
  createPlanProjectionWorkspace,
} from '../../src/course/geometry/plan-coordinate.js';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('arc projection is independent of accumulated heading winding', () => {
  // Twelve right-angle bends between short straights wind the heading three times round.
  const plan = compileCourseGeometry(
    {
      plan: Array.from({ length: 12 }, (_, i) => [
        { kind: 'straight', id: `straight-${i}`, length: 10 },
        { kind: 'arc', id: `turn-${i}`, length: 50 * Math.PI, radius: 100, turn: 'right' },
      ]).flat(),
    },
    '/section',
  );
  const reader = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) =>
    Object.assign(out, { left: -10, right: 10 }),
  );
  const primitive = plan.segments.at(-1);
  const s = primitive.sStart + (primitive.sEnd - primitive.sStart) * 0.37;
  const point = reader.toWorld(s, 2, createPlanCoordinateSample());
  const projected = reader.locateLocal(point, s, { s: 0, l: 0, inDomain: false }, createPlanProjectionWorkspace());

  near(projected.s, s);
  near(projected.l, 2);
  assert.equal(projected.inDomain, true);
  assert.ok(Math.abs(point.heading) <= Math.PI);
});
