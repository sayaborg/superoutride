import assert from 'node:assert/strict';
import test from 'node:test';
import { admitModels } from '../../tools/road-data/shared/course-models.ts';
import { profileOf, withinRise } from '../../tools/road-data/shared/road-profile.ts';
import { lapHeights } from '../../tools/road-data/final-lap-2/final-lap-2-course.ts';
import { INTERVAL_UNITS, INTERVALS, LAP_UNITS } from '../../tools/road-data/final-lap-2/final-lap-2-road.ts';

/** A unit's metres by the clock, a cell's units (where the pieces' grades change), and a small lap's runs' factors. */
const METRES = 0.01;
const CELL = 4 * INTERVAL_UNITS;
const factors = [0.6, 1.5, 0.8, 1.25];

/** A lap whose runs, a quarter of its intervals each, are laid at their factors: its stations and its length. */
function laidLap() {
  const lengths = Array.from(
    { length: INTERVALS },
    (_, i) => INTERVAL_UNITS * METRES * factors[Math.floor((i * factors.length) / INTERVALS)],
  );
  const starts = [0];
  for (const l of lengths) starts.push(starts.at(-1) + l);
  const length = starts.at(-1);
  const fromStart = (u) => {
    const i = Math.floor(u / INTERVAL_UNITS);
    return starts[i] + ((u % INTERVAL_UNITS) / INTERVAL_UNITS) * lengths[i];
  };
  return { length, fromStart };
}

/** A piece: a grade, and changes over cells (`[from cell, to cell, change]`), metres along its stretch. */
const piece = (grade, changes) => ({
  stretch: LAP_UNITS * METRES,
  grade,
  changes: changes.map(([a, b, change]) => ({ from: a * CELL * METRES, to: b * CELL * METRES, change })),
});

test('a lap of runs laid at different lengths keeps its grade where they meet, and closes', () => {
  const { length, fromStart } = laidLap();
  // The line a third of the way into an interval, so that the lap is cut there too.
  const line = 37 * INTERVAL_UNITS + 85;
  const atLine = fromStart(line);
  const station = (u) => (((fromStart(u) - atLine) % length) + length) % length;
  const heights = lapHeights(
    piece(0.01, [
      [10, 20, 0.04],
      [60, 63, -0.07],
      [128, 130, 0.02],
      [200, 240, 0.015],
    ]),
    METRES,
    station,
    length,
    line,
  );
  assert.equal(heights.factor, (LAP_UNITS * METRES) / length);
  const road = profileOf(heights.bends, [], heights.kinks);
  // No step: no kink within the lap, and each bend's grade at its end the next one's at its start.
  assert.deepEqual(
    road.kinks.filter((k) => k.at > 0),
    [],
  );
  const bends = [...road.bends].sort((p, q) => p.from - q.from);
  let most = 0;
  for (let i = 1; i < bends.length; i++) {
    const [p, q] = [bends[i - 1], bends[i]];
    if (Math.abs(p.to - q.from) > 1e-9) continue;
    most = Math.max(most, Math.abs(road.grade(p.from) + p.curvature * (p.to - p.from) - road.grade(q.from)));
  }
  assert.ok(most <= 1e-12, `the grade steps by ${most}`);
  assert.ok(Math.abs(road.height(length)) <= 1e-9, `the lap ends ${road.height(length)} m up`);
  assert.ok(Math.abs(road.grade(length) - road.grade(0)) <= 1e-9, "the lap's grade does not close");
});

/** A closed lap 1,000 m long rising `rise` m and falling back. */
const hill = (rise) => ({
  bends: [
    { from: 0, to: 250, curvature: (4 * rise) / 250 / 500 },
    { from: 250, to: 750, curvature: (-8 * rise) / 250 / 500 / 2 },
    { from: 750, to: 1000, curvature: (4 * rise) / 250 / 500 },
  ],
  kinks: [],
});

/** A profile's highest less its lowest, every 0.01 m over `[0, length]`. */
const apart = (road, length) => {
  const profile = profileOf(road.bends, [], road.kinks);
  const heights = Array.from({ length: length * 100 + 1 }, (_, k) => profile.height(k / 100));
  return Math.max(...heights) - Math.min(...heights);
};

test("a lap rising and falling farther than its model's elevation is taken within it, exactly", () => {
  const road = hill(30);
  const within = withinRise(road, 1000, 12.8);
  assert.ok(within.factor < 1);
  assert.ok(Math.abs(apart(within.road, 1000) - 12.8) <= 1e-9, `${apart(within.road, 1000)} m apart`);
  const profile = profileOf(within.road.bends, [], within.road.kinks);
  assert.ok(Math.abs(profile.height(1000)) <= 1e-9, 'the lap closes');
});

test("a lap within its model's elevation is left as it is", () => {
  const road = hill(10);
  const within = withinRise(road, 1000, 40.4);
  assert.equal(within.factor, 1);
  assert.equal(within.road, road);
});

/** A models' document of one layout, a circle of two half-circles 50 m about its centre, with `extra` fields. */
const circle = (extra) => ({
  layouts: [
    {
      id: 'circle',
      course: 'A CIRCLE',
      length_m: 100 * Math.PI,
      ...extra,
      segments: [
        {
          type: 'arc',
          start: [50, 0],
          end: [-50, 0],
          center: [0, 0],
          radius_m: 50,
          sweep_rad: Math.PI,
          length_m: 50 * Math.PI,
        },
        {
          type: 'arc',
          start: [-50, 0],
          end: [50, 0],
          center: [0, 0],
          radius_m: 50,
          sweep_rad: Math.PI,
          length_m: 50 * Math.PI,
        },
      ],
    },
  ],
});

test("a model's elevation is read where its layout gives one, a positive length", () => {
  assert.equal(admitModels(circle({}), 'models').get('circle').elevation, undefined);
  assert.equal(admitModels(circle({ elevation_m: 12.8 }), 'models').get('circle').elevation, 12.8);
  for (const elevation_m of [0, -1, Infinity, Number.NaN, '12.8'])
    assert.throws(() => admitModels(circle({ elevation_m }), 'models'), /elevation/);
});
