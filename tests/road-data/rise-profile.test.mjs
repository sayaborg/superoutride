import assert from 'node:assert/strict';
import test from 'node:test';
import { riseProfile, tableHeight } from '../../tools/road-data/shared/rise-profile.ts';
import { bendOf, profileOf } from '../../tools/road-data/shared/road-profile.ts';

/** A long level stretch ending in a short climb of two steps: one run, its line leaning a step either way. */
const RESOLUTION = 0.03;
const grades = [...new Array(145).fill(0), ...new Array(5).fill(2 * RESOLUTION)];
const station = (p) => p * 24.576;

const profileOfRise = (r) => profileOf(r.changes.map(bendOf), [], r.kinks);

test('a road crossing nowhere is as the rule had it, with no kinks', () => {
  const none = riseProfile(grades, RESOLUTION, station);
  assert.deepEqual(none.kinks, []);
  assert.deepEqual(riseProfile(grades, RESOLUTION, station, [0]), none);
  assert.ok(Math.abs(profileOfRise(none).height(station(70))) > 1, 'the line leans, so the height departs');
});

test("a crossing's passages keep the table's heights", () => {
  const passages = [40, 120];
  const p = profileOfRise(riseProfile(grades, RESOLUTION, station, passages));
  for (const q of passages)
    assert.ok(Math.abs(p.height(station(q)) - tableHeight(grades, station, q)) < 1e-9, `the passage at ${q}`);
});

test('the grade a mended stretch adds stays within a step, and the grade within two of the table', () => {
  const rise = riseProfile(grades, RESOLUTION, station, [20, 40, 75, 120, 140]);
  let offset = 0;
  for (const k of rise.kinks) {
    offset += k.change;
    assert.ok(Math.abs(offset) <= RESOLUTION + 1e-12, `the grade added from ${k.at} m`);
  }
  assert.ok(Math.abs(offset) < 1e-12, 'past the last fixed point the departure is held');
  assert.ok(rise.departure <= 2 * RESOLUTION + 1e-12);
});
