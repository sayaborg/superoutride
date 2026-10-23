import assert from 'node:assert/strict';
import test from 'node:test';
import { compileCourseLanes } from '../../src/course/compiler/course-lanes.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';

// A 100 m Section: a position at joint `end` is 100 m on, any other joint's at its offset.
const LENGTH = 100;
const resolve = (at) => ({ s: at.joint === 'end' ? LENGTH + at.offset : at.offset });
const start = { joint: 'first', offset: 0 },
  end = { joint: 'end', offset: 0 };

const section = (centerLateral) => ({
  lanes: [
    { kind: 'lane', id: 'a', width: 3.6 },
    {
      kind: 'median',
      width: [
        { at: start, width: 0 },
        { at: end, width: 2 },
      ],
    },
    { kind: 'lane', id: 'b', width: 3.6 },
  ],
  centerLane: 'a',
  centerLateral,
});

const lane = (lanes, id) => lanes.elements.find((element) => element.kind === 'lane' && element.lane.id === id).lane;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} is not ${expected}`);

test("the centre lane's centre lies at centerLateral and the other lanes lie outward from it", () => {
  const lanes = compileCourseLanes(section(1.5), resolve, LENGTH, '/sections/0/lanes');
  for (const s of [0, 50, LENGTH]) {
    near(courseBoundaryAt(lanes.center.center, s), 1.5);
    near(courseBoundaryAt(lanes.center.left, s), -0.3);
    near(courseBoundaryAt(lane(lanes, 'b').left, s), 3.3 + (2 * s) / LENGTH);
  }
});

test('a centerLateral of values at Positions moves the lanes straight between them', () => {
  const lanes = compileCourseLanes(
    section([
      { at: start, lateral: -1 },
      { at: { joint: 'first', offset: 40 }, lateral: 3 },
      { at: end, lateral: 3 },
    ]),
    resolve,
    LENGTH,
    '/sections/0/lanes',
  );
  assert.deepEqual(
    lanes.center.center.vertices.map((vertex) => vertex.at.s),
    [0, 40, LENGTH],
  );
  [-1, 3, 3].forEach((l, i) => near(lanes.center.center.vertices[i].l, l));
  near(courseBoundaryAt(lane(lanes, 'b').right, 20), 1 + 1.8 + 0.4 + 3.6);
});
