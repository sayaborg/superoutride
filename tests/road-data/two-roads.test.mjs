import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRoadPicture, compositeOf, narrowGround, paintAt } from '../../tools/road-data/shared/two-roads.ts';
import { PiecewiseLinear } from '../../tools/road-data/shared/piecewise-linear.ts';
import { TC0150ROD_LEVELS } from '../../tools/road-data/taito/tc0150rod.ts';

/** A road 10 units either side of its centre: an edge band 2 units wide each side, a line 1 unit wide at its centre. */
const ROAD = [
  { at: -10, right: 'edge' },
  { at: -8, right: 'surface' },
  { at: -0.5, right: 'line' },
  { at: 0.5, right: 'surface' },
  { at: 8, right: 'edge' },
  { at: 10, right: 'outside' },
];
/** A narrower road with no line: an edge band 1 unit wide each side. */
const LANE = [
  { at: -5, right: 'edge' },
  { at: -4, right: 'surface' },
  { at: 4, right: 'edge' },
  { at: 5, right: 'outside' },
];

/** The line a picture draws at `unitsAPixel` units a pixel, 64 pixels, its centre at pixel edge 32. */
const lineOf = (picture, unitsAPixel) => ({
  paints: Array.from({ length: 64 }, (_, x) => paintAt(picture, (x + 0.5 - 32) * unitsAPixel)),
  centre: 32,
  unitsAPixel,
});

test("a road's picture is checked against its original's nearest line, at the line's units a pixel", () => {
  checkRoadPicture(lineOf(ROAD, 0.5), 'a line', ROAD);
  checkRoadPicture(lineOf(ROAD, 1), 'a line', ROAD);
  const drawn = lineOf(ROAD, 0.5);
  const paints = [...drawn.paints];
  paints[32 + 10] = 'outside'; // 5.25 units right of the centre, on the surface
  assert.throws(() => checkRoadPicture({ ...drawn, paints }, 'a line', ROAD), /draws outside at 5.25/);
});

test('two roads of their own pictures show each road its own lines and edge bands', () => {
  const intervals = compositeOf([ROAD.map((e) => e.at - 20), LANE.map((e) => e.at + 20)], [ROAD, LANE]);
  const edges = intervals.filter((i) => i.paint === 'edge');
  assert.deepEqual(
    edges.map((i) => [i.left.road, i.left.at, i.right.at]),
    [
      [0, -10, -8],
      [0, 8, 10],
      [1, -5, -4],
      [1, 4, 5],
    ],
  );
  assert.deepEqual(
    intervals.filter((i) => i.paint === 'line').map((i) => [i.left.road, i.left.at, i.right.at]),
    [[0, -0.5, 0.5]],
  );
});

test("two overlapping roads show each paint as their hardware's order levels it", () => {
  // The narrower road centred 8 units right: its left edge band (3 to 4) lies on the road's surface, the road's right
  // edge band (8 to 10) under its surface.
  const edges = (levels) =>
    compositeOf([ROAD.map((e) => e.at), LANE.map((e) => e.at + 8)], [ROAD, LANE], levels)
      .filter((i) => i.paint === 'edge')
      .map((i) => [i.left.road, i.left.at, i.right.at]);
  // Sega's: either road's surface over both roads' edge bands.
  assert.deepEqual(edges(), [
    [0, -10, -8],
    [1, 4, 5],
  ]);
  // The TC0150ROD's: road B's edge band over road A's surface, road B's surface over road A's edge band.
  assert.deepEqual(edges(TC0150ROD_LEVELS), [
    [0, -10, -8],
    [1, -5, -4],
    [1, 4, 5],
  ]);
});

test('the ground between two roads of their own widths is narrow where it is no wider than OPEN', () => {
  // Roads 4 and 2 units wide either side of their centres, 0.1 m a unit: they touch at w = 3, and OPEN (0.5 m) of
  // ground lies between them at w = 5.5.
  const width = new PiecewiseLinear([{ from: 0, to: 100, a: 0, b: 0.1 }]);
  const narrow = narrowGround(width, [4, 2], 0.1);
  assert.equal(narrow.length, 1);
  assert.ok(Math.abs(narrow[0].from - 30) < 1e-9 && Math.abs(narrow[0].to - 55) < 1e-9);
});
