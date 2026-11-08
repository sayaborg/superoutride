import assert from 'node:assert/strict';
import test from 'node:test';
import { paletteTicks, skyChanges } from '../../tools/road-data/chase-hq/chase-hq-backgrounds.ts';
import { bottomLayer } from '../../tools/road-data/taito/tc0100scn.ts';

test("the chip's control word 6 names its bottom layer by its bit 3", () => {
  assert.equal(bottomLayer(0x28), 1);
  assert.equal(bottomLayer(0x20), 0);
});

const steps = () => 8;
const record = (mode, scene = 0, palette = 0) => ({ mode, scene, palette });

test('a mode the original picks the set for at random takes the stage set; mode 4, set 1', () => {
  // A stage 2 course: mode 4 at its start, mode 2 halfway (K, 2026-11-08: set 1, then the stage's set 2).
  const changes = skyChanges([record(4), record(null), record(2), record(null)], 2, steps);
  assert.deepEqual(
    changes.map((c) => [c.record, c.set, c.mode]),
    [
      [0, 1, 4],
      [2, 2, 2],
    ],
  );
  // A stage 1 course: mode 3, then mode 1: its set 0 throughout.
  assert.deepEqual(
    skyChanges([record(3), record(1)], 0, steps).map((c) => c.set),
    [0, 0],
  );
});

test("a change of scene fades in 20 ticks, of road palette in its steps, the longer of both, a mode's at once", () => {
  const changes = skyChanges(
    [record(3, 0, 1), record(null, 1, 1), record(null, 1, 2), record(null, 2, 3), record(2, 2, 3)],
    0,
    (a, b) => 4 * (b - a + 5),
  );
  assert.deepEqual(
    changes.map((c) => c.ticks),
    [0, 20, 24, 24, 0],
  );
  assert.equal(paletteTicks([31, 0, 0, 0], [0, 31 << 5, 0, 0]), 124);
});
