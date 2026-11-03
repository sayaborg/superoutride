import assert from 'node:assert/strict';
import test from 'node:test';
import { closeLaps, lapPieces, lapPoints, lapReport } from '../../tools/road-data/shared/lap-closure.ts';

/** How far a lap's end lies from its start, metres. */
const gap = (lap, interval) => Math.hypot(...lapPoints(lap, interval).at(-1));
const sum = (v) => v.reduce((s, x) => s + x, 0);

test('a lap its table closes keeps its turns, scaled, with no correction', () => {
  const table = { curves: Array(64).fill(3), interval: 5, turns: 1 };
  const { scale, laps } = closeLaps([table]);
  assert.ok(Math.abs(scale * 3 * 5 * 64 - 2 * Math.PI) < 1e-12);
  assert.ok(Math.max(...laps[0].corrections.map(Math.abs)) < 1e-12);
  assert.deepEqual(lapPieces(laps[0], 5).length, 1);
});

test("an original's laps share one scale, each closing exactly in heading and position", () => {
  // An oval whose second bend turns too far, and a figure of eight (three quarters each way) whose loops differ.
  const oval = [...Array(20).fill(0), ...Array(12).fill(3), ...Array(20).fill(0), ...Array(13).fill(3)];
  const eight = [...Array(12).fill(0), ...Array(18).fill(3), ...Array(12).fill(0), ...Array(19).fill(-3)];
  const tables = [
    { curves: oval, interval: 10, turns: 1 },
    { curves: eight, interval: 10, turns: 0 },
  ];
  const { scale, laps } = closeLaps(tables);
  laps.forEach((lap, i) => {
    assert.ok(Math.abs(sum(lap.turns) - 2 * Math.PI * tables[i].turns) < 1e-9);
    assert.ok(gap(lap, 10) < 1e-9);
  });
  // The scale is the corrections' least: they lie square to the scaled table, summed over both laps.
  const across = sum(laps.map((lap, i) => sum(lap.corrections.map((e, j) => e * tables[i].curves[j]))));
  assert.ok(Math.abs(across) < 1e-9, `${across}`);
  assert.ok(scale > 0);
  assert.equal(lapReport(tables[1], laps[1]).crossings, 1);
  assert.equal(lapReport(tables[0], laps[0]).straight.metres, 200);
});
