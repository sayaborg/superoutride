import assert from 'node:assert/strict';
import test from 'node:test';
import { courseModel } from '../../tools/road-data/shared/course-models.ts';
import { curvePlan, curveRuns } from '../../tools/road-data/shared/curve-plan.ts';
import { lapOnModel } from '../../tools/road-data/shared/model-lap.ts';

/** An oval's table: four corners of one value, four straights, 256 intervals. */
const values = Array.from({ length: 256 }, (_, i) => (Math.floor(i / 32) % 2 ? 0 : 8));

test("a lap's changes term sums its runs, each counting on its own", () => {
  const runs = curveRuns(values).length;
  const inputs = {
    values,
    model: courseModel('fuji_1975_1983', 'POLE POSITION II FUJI'),
    roadWidth: 11,
    leastLaneRadius: 9.51,
  };
  // Every run doubled: a doubling each, squared, summed over the runs; the lap need not close for its terms.
  const { measure } = lapOnModel(inputs, { turnScale: 1, start: 0, factors: new Array(runs).fill(1) });
  assert.equal(measure.terms.change, runs);
  assert.ok(Number.isFinite(measure.terms.distance));
  assert.equal(measure.meets, false);
});

test('a curve record of its own length is laid as one interval of that length', () => {
  const model = courseModel('fuji_1975_1983', 'POLE POSITION II FUJI');
  const alike = { values, model, roadWidth: 11, leastLaneRadius: 9.51 };
  // Each two intervals one record twice as long: the same runs, their pieces the same lengths and turns.
  const own = { ...alike, values: values.filter((_, i) => i % 2 === 0), lengths: new Array(128).fill(2) };
  const runs = curveRuns(values).length;
  const answer = { turnScale: 1, start: 0, factors: Array.from({ length: runs }, (_, k) => (k % 3) / 4) };
  const plan = ({ intervals, scale }) => curvePlan(intervals, scale);
  const [a, b] = [plan(lapOnModel(alike, answer)), plan(lapOnModel(own, answer))];
  assert.equal(b.length, a.length);
  b.forEach((piece, k) => {
    assert.ok(Math.abs(piece.length - a[k].length) < 1e-9);
    assert.ok(Math.abs(piece.turn - a[k].turn) < 1e-12);
  });
});
