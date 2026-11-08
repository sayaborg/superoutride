import assert from 'node:assert/strict';
import test from 'node:test';
import { readCourseDocument } from '../../src/course/course-document.ts';
import { layRoad } from '../../tools/road-data/shared/road-layout.ts';
import { micrometre } from '../../tools/road-data/shared/section-writing.ts';

/** A straight road of 600 m, two lanes either side of P, cut where a tunnel's limits begin and end (200 m, 400 m). */
const ROAD = { left: -3.6, right: 3.6 };
const band = { left: ROAD.left, right: ROAD.right, colors: [0x2108], material: 'ASPHALT' };
/** Its limits: 10 m either side, 2 m in the tunnel; its ground grass left, sand right, the left sand from 300 m. */
const limitsOf = (span) => {
  const half = span.from === 200 ? 2 : 10;
  const knots = (side) => [
    [span.from, side * half],
    [span.to, side * half],
  ];
  return {
    left: knots(-1),
    right: knots(1),
    ground: {
      left: [
        [0, 'GRASS'],
        [300, 'SAND'],
      ],
      right: [[0, 'SAND']],
    },
  };
};
const parts = (span, positionAt, limits = limitsOf(span)) => ({
  lanes: [
    { kind: 'lane', id: 'a', width: 3.6 },
    { kind: 'lane', id: 'b', width: 3.6 },
  ],
  centerLane: 'a',
  centerLateral: micrometre(-1.8),
  linkLane: 'a',
  strips: [],
  outermost: [
    { band, left: micrometre(ROAD.left), right: micrometre(ROAD.right) },
    { band, left: micrometre(ROAD.left), right: micrometre(ROAD.right) },
  ],
  limits,
  environments: [
    {
      at: positionAt(span.from),
      name: 'TEST',
      background: { image: 'test-sky', horizonY: 0.5, yawOrigin: 0 },
      transition: 0,
    },
  ],
});
const layout = (section = parts) => ({
  id: 'test',
  name: 'TEST',
  pieces: [{ length: 600, turn: 0 }],
  cuts: [200, 400],
  reach: 10,
  road: { bends: [], kinks: [] },
  grids: {
    origin: { s: 190, lateral: 0 },
    originals: { car: { places: [{ ahead: 0, right: 0 }] } },
    limits: [10, 10],
    lanes: ['a', 'b'],
    meet: 0,
    laneWidth: 3.6,
  },
  checkpoints: [],
  finish: { id: 'test-GOAL', s: 550 },
  section,
});

test('a road is cut where its original changes at once, and its course limits jump only at the Links', () => {
  const { document, spans } = layRoad(layout());
  const read = readCourseDocument(document);
  assert.ok(read.ok, JSON.stringify(read.diagnostics ?? read).slice(0, 600));
  assert.deepEqual(
    spans.map((s) => [s.from, s.to]),
    [
      [0, 200],
      [200, 400],
      [400, 600],
    ],
  );
  const left = document.sections.map((s) =>
    s.boundaries.find((b) => b.id === 'outer-left').knots.map((k) => k.lateral),
  );
  assert.deepEqual(left, [
    [-10, -10],
    [-2, -2],
    [-10, -10],
  ]);
  assert.deepEqual(
    document.links.map((l) => [l.from.section, l.to]),
    [
      ['test-1', 'test-2'],
      ['test-2', 'test-3'],
    ],
  );
});

test("each side's ground reaches its limit in its own material, changing where it does, none within the road", () => {
  const ground = (document, k) =>
    document.sections[k].strips.filter((s) => s.material !== null).map((s) => [s.start.offset, s.material]);
  // Limits 10 m either side all along: the middle Section's left ground changes at 300 m.
  const wide = (span, positionAt) =>
    parts(span, positionAt, {
      ...limitsOf(span),
      left: [
        [span.from, -10],
        [span.to, -10],
      ],
      right: [
        [span.from, 10],
        [span.to, 10],
      ],
    });
  assert.deepEqual(ground(layRoad(layout(wide)).document, 1), [
    [0, 'GRASS'],
    [100, 'SAND'],
    [0, 'SAND'],
  ]);
  // The tunnel's limits, 2 m either side, lie within the road: no ground beside it.
  assert.deepEqual(ground(layRoad(layout()).document, 1), []);
});

test('course limits that jump within a Section stop the conversion', () => {
  const jumping = (span, positionAt) =>
    parts(span, positionAt, {
      ...limitsOf(span),
      left: [
        [span.from, -10],
        [span.from + 50, -10],
        [span.from + 50, -2],
        [span.to, -2],
      ],
    });
  assert.throws(() => layRoad(layout(jumping)), /jump within its Section test-1/);
});
