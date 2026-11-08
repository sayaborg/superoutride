import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** The explosion's script as the conversion wrote it (CI holds no ROM). */
const script = JSON.parse(
  readFileSync(new URL('../../content/originals/explosions/polepos2-explosion.json', import.meta.url), 'utf8'),
);

/** The frames as the original's script draws them: [from, to, what], the fireball as `picture-size`. */
const RUNS = [
  [0, 19, 'vehicle'],
  [20, 20, '3-45'],
  [21, 22, 'vehicle'],
  [23, 24, '3-45'],
  [25, 25, 'vehicle'],
  [26, 28, '3-49'],
  [29, 29, 'vehicle'],
  [30, 30, '3-49'],
  [31, 31, 'vehicle'],
  [32, 32, '3-49'],
  [33, 33, 'vehicle'],
  [34, 35, '3-49'],
  [36, 36, '3-53'],
  [37, 37, '3-49'],
  [38, 41, '3-53'],
  [42, 47, '3-57'],
  [48, 51, '4-53'],
  [52, 57, '4-57'],
  [58, 63, '4-61'],
  [64, 69, '5-57'],
  [70, 70, '5-61'],
  [71, 71, '5-57'],
  [72, 77, '5-61'],
  [78, 78, '6-57'],
  [79, 79, '5-61'],
  [80, 85, '6-57'],
  [86, 86, '6-61'],
  [87, 87, '6-57'],
  [88, 93, '6-61'],
  [94, 94, '7-57'],
  [95, 95, '6-61'],
  [96, 101, '7-57'],
  [102, 102, '7-61'],
  [103, 103, '7-57'],
  [104, 127, '7-61'],
  [128, 173, null],
];

test("the explosion's script draws the original's frames, throws and clears its debris and brings the car back", () => {
  const frames = RUNS.flatMap(([from, to, what]) =>
    Array.from({ length: to - from + 1 }, () =>
      what === null || what === 'vehicle' ? what : `polepos2-explosion-${what}`,
    ),
  );
  assert.deepEqual(script.frames, frames);
  assert.equal(script.recovers, 174);
  assert.equal(script.framesASecond, 24_576_000 / 4 / 384 / 264);
  assert.deepEqual(script.debris.thrown, [8, 13, 22, 27]);
  assert.equal(script.debris.cleared, 162);
  assert.equal(script.debris.pictures.length, 8);
  assert.deepEqual(script.debris.rule.damped, [0, 3, 4, 7]);
});
