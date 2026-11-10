import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRoadPicture,
  composite,
  compositeOf,
  lanesOverTwoRoads,
  narrowGround,
  paintAt,
  segaLevels,
} from '../../tools/road-data/shared/two-roads.ts';
import { PiecewiseLinear } from '../../tools/road-data/shared/piecewise-linear.ts';
import { TC0150ROD_LEVELS } from '../../tools/road-data/taito/tc0150rod.ts';
import { OUTRUN_ROAD } from '../../tools/road-data/outrun/outrun-constants.ts';
import { TURBO_OUTRUN_ROAD } from '../../tools/road-data/turbo-outrun/turbo-outrun-cross-section.ts';

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

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} ≠ ${expected}`);
const sameLanes = (actual, expected, what) => {
  for (const k of ['a', 'b', 'c', 'm', 'd', 'e', 'f']) close(actual[k], expected[k], `${what} lane ${k}`);
};
/** A width in each of the rule's four stretches of `rule`, and its breaks. */
const widthsOf = (rule) => {
  const [line, half, farthest] = rule.breaks;
  return [line / 2, line, (line + half) / 2, half, (half + farthest) / 2, farthest, farthest + 10];
};

test("the lanes over two roads centred w either side of P are OUTRUN's and TURBO OUTRUN's rule as it stood", () => {
  for (const picture of [OUTRUN_ROAD, TURBO_OUTRUN_ROAD]) {
    const rule = lanesOverTwoRoads(picture);
    for (const w of widthsOf(rule)) {
      const at = rule.lanesAt(-w, w);
      sameLanes(at.lanes, rule.lanes(w), `w ${w}`);
      close(at.middle, 0, `middle at w ${w}`);
      close(at.centreLane, rule.centreLaneAt(w), `lane b's centre at w ${w}`);
      assert.equal(at.left, 0);
    }
  }
});

test('the lanes over two roads take each road at its own lateral, road 0 left or right', () => {
  const rule = lanesOverTwoRoads(OUTRUN_ROAD);
  const [line] = rule.breaks;
  for (const w of widthsOf(rule)) {
    const centreLane = w >= line ? 0 : w - (w + line) / 2;
    const right = rule.lanesAt(0, 2 * w);
    sameLanes(right.lanes, rule.lanes(w), `road 1 right, w ${w}`);
    close(right.centreLane, centreLane, `road 1 right, lane b's centre at w ${w}`);
    assert.equal(right.left, 0);
    const left = rule.lanesAt(2 * w, 0);
    sameLanes(left.lanes, rule.lanes(w), `road 1 left, w ${w}`);
    close(left.centreLane, centreLane, `road 1 left, lane b's centre at w ${w}`);
    assert.equal(left.left, 1);
  }
});

test("the lanes along two roads whose centres change sides keep their widths and lane b's centre unbroken", () => {
  const rule = lanesOverTwoRoads(TURBO_OUTRUN_ROAD);
  const [line, half, farthest] = rule.breaks;
  // Road 0 along P; road 1's centre from 2 × farthest + 40 right of it to as far left over positions 0 to 1000.
  const span = 2 * farthest + 40;
  const centre0 = new PiecewiseLinear([{ from: 0, to: 1000, a: 0, b: 0 }]);
  const centre1 = new PiecewiseLinear([{ from: 0, to: 1000, a: span, b: (-2 * span) / 1000 }]);
  const along = rule.lanesAlong(centre0, centre1);
  const crossing = 500;
  // A vertex where they cross, and where w crosses each of the rule's widths, either side.
  const vertices = along.centreLane.breaks;
  const placeOf = (w) => (1000 * (span - 2 * w)) / (2 * span);
  for (const p of [crossing, ...[line, half, farthest].flatMap((w) => [placeOf(w), 1000 - placeOf(w)])])
    assert.ok(
      vertices.some((v) => Math.abs(v - p) < 1e-6),
      `a vertex at ${p}`,
    );
  for (const k of ['a', 'b', 'c', 'm', 'd', 'e', 'f']) assert.deepEqual(along.widths[k].breaks, vertices);
  // At the crossing the roads are one: w is 0.
  sameLanes(
    Object.fromEntries(['a', 'b', 'c', 'm', 'd', 'e', 'f'].map((k) => [k, along.widths[k].at(crossing)])),
    { a: rule.outer, b: line, c: 0, m: 0, d: 0, e: line, f: rule.outer },
    'at the crossing',
  );
  // Unbroken: each piece meets the next.
  for (const f of [along.centreLane, ...Object.values(along.widths)]) {
    for (let i = 0; i + 1 < f.pieces.length; i++) {
      const [q, r] = [f.pieces[i], f.pieces[i + 1]];
      close(q.a + q.b * (q.to - q.from), r.a, `continuous at ${q.to}`);
    }
  }
  // Everywhere the lanes and lane b's centre are the rule's at the place.
  for (let p = 0; p <= 1000; p += 7.3) {
    const at = rule.lanesAt(centre0.at(p), centre1.at(p));
    for (const k of ['a', 'b', 'c', 'm', 'd', 'e', 'f']) close(along.widths[k].at(p), at.lanes[k], `${k} at ${p}`);
    close(along.centreLane.at(p), at.centreLane, `lane b's centre at ${p}`);
  }
  // The left road changes where they cross.
  assert.deepEqual(along.left, [
    { from: 0, to: crossing, road: 0 },
    { from: crossing, to: 1000, road: 1 },
  ]);
});

test('two roads composed with road 1 left of road 0 show what they show with the roads named the other way', () => {
  const levels = segaLevels(2);
  const swapped = composite([20, -20], [ROAD, LANE], levels);
  const named = composite([-20, 20], [LANE, ROAD], [levels[1], levels[0]]);
  const shown = (intervals, road) =>
    intervals.map((i) => [i.paint, road(i.left.road), i.left.at, road(i.right.road), i.right.at]);
  assert.deepEqual(
    shown(swapped, (r) => r),
    shown(named, (r) => 1 - r),
  );
});
