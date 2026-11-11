import assert from 'node:assert/strict';
import test from 'node:test';
import { arcRoad } from '../../tools/road-data/jaleco/road-heights.ts';

const tables = { stages: 1, stageTables: [0, 0], planBytes: 28, profileBytes: 24, turnUnits: 0x10000 };
const near = (a, b) => Math.abs(a - b) < 1e-6;

test("a vertical arc's angle changes evenly along it, so a quarter circle rises its radius", () => {
  const R = 1000;
  const quarter = (Math.PI / 2) * R;
  const road = arcRoad(
    tables,
    [
      { start: 0, radius: R, rising: true, height: 0, grade: 0 },
      // Straight up from the arc's end: 90° is 16,384 units of 65,536.
      { start: quarter, radius: 0, rising: false, height: R, grade: 0x4000 },
    ],
    quarter + 500,
  );
  assert.ok(near(road.height(quarter), R));
  assert.ok(near(road.angle(quarter / 2), Math.PI / 4));
  assert.ok(near(road.height(quarter + 500), R + 500));
  assert.ok(road.departure < 1e-6);
});

test('a record starting at another angle kinks the road there; a falling arc bends down', () => {
  const road = arcRoad(
    tables,
    [
      { start: 0, radius: 0, rising: false, height: 0, grade: 0 },
      { start: 100, radius: 0, rising: false, height: 0, grade: -0x1000 },
      { start: 200, radius: 400, rising: false, height: 0, grade: 0 },
    ],
    300,
  );
  assert.ok(near(road.angle(150), -Math.PI / 8));
  assert.ok(near(road.height(200), -100 * Math.sin(Math.PI / 8)));
  assert.ok(near(road.angle(300), -100 / 400));
  // The table says 0 where the third record starts: the road departs from it by the second's fall.
  assert.ok(near(road.departure, 100 * Math.sin(Math.PI / 8)));
});
