import assert from 'node:assert/strict';
import test from 'node:test';
import { courseModel } from '../../tools/road-data/shared/course-models.ts';
import { curveRuns } from '../../tools/road-data/shared/curve-plan.ts';
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
