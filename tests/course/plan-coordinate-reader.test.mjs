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
  const corners = [
    [0, 100],
    [200, 100],
    [200, -100],
    [0, -100],
  ];
  const plan = compileCourseGeometry(
    {
      pis: [
        { id: 'start', x: 0, z: 0, radius: 0 },
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `turn-${i}`,
          x: corners[i % 4][0],
          z: corners[i % 4][1],
          radius: 100,
        })),
        { id: 'end', x: 0, z: 0, radius: 0 },
      ],
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
