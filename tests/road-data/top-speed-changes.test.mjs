import assert from 'node:assert/strict';
import test from 'node:test';
import { colorStretches } from '../../tools/road-data/shared/color-stretches.ts';
import { lookChanges, placedStretches } from '../../tools/road-data/top-speed/top-speed-backgrounds.ts';

const look = (a, colors, holds = false) => ({ a, b: 0, sky: 1, colors: [colors], holds });
/** Two ticks a step of the largest channel's change, as TOP SPEED's colors fade. */
const fade = (from, to) => 2 * Math.abs(from[0] - to[0]);

test("TOP SPEED's change takes the longer of its bands' wipe and its colors' fade", () => {
  const changes = lookChanges([look(0, 0), look(0, 10), look(1, 10), look(2, 40)], 44, fade);
  assert.deepEqual(
    changes.map((c) => [c.record, c.ticks]),
    [
      [0, 0],
      [1, 20],
      [2, 44],
      [3, 60],
    ],
  );
});

test("TOP SPEED's colors hold on a sky change's record and the one after it", () => {
  // Record 1 changes the sky and records 1 and 2 bring other colors: they show from record 3, the next record's own.
  const changes = lookChanges([look(0, 0), look(1, 5, true), look(1, 6), look(1, 7), look(1, 7)], 44, fade);
  assert.deepEqual(
    changes.map((c) => [c.record, c.colors, c.ticks]),
    [
      [0, 0, 0],
      [1, 0, 44],
      [3, 3, 14],
    ],
  );
});

test("TOP SPEED's colors at a place are its change's, however a place cuts them, a dark place's its own", () => {
  // A change of colors from 10 m over 10 m; a hill from 12 m and a tunnel from 15 m to 25 m.
  const stretches = colorStretches(['a', 'b'], [{ at: 10, length: 10 }], 0, 40);
  const placeAt = (s) => ({ hill: s >= 12, dark: s >= 15 && s < 25 });
  const placed = placedStretches(
    stretches.map((t) => ({ ...t, colors: { set: t.colors }, before: t.before && { set: t.before } })),
    [12, 15, 25],
    placeAt,
  );
  assert.deepEqual(
    placed.map((t) => [t.from, t.to, t.colors.set, t.before?.set ?? null, t.colors.hill, t.colors.dark]),
    [
      [0, 10, 'a', null, false, false],
      [10, 12, 'b', 'a', false, false],
      [12, 15, 'b', 'a', true, false],
      [15, 20, 'b', null, true, true],
      [20, 25, 'b', null, true, true],
      [25, 40, 'b', null, true, false],
    ],
  );
  // Cut again at every metre, each place's colors are the same.
  const finer = placedStretches(
    stretches.map((t) => ({ ...t, colors: { set: t.colors }, before: t.before && { set: t.before } })),
    [...Array.from({ length: 39 }, (_, k) => k + 1), 12, 15, 25],
    placeAt,
  );
  const at = (list, s) => {
    const t = list.find((x) => x.from <= s && s < x.to);
    return [t.colors.set, t.before?.set ?? null, t.colors.hill, t.colors.dark];
  };
  for (let s = 0.5; s < 40; s += 1) assert.deepEqual(at(finer, s), at(placed, s), `at ${s} m`);
});
