import assert from 'node:assert/strict';
import test from 'node:test';
import { profileOf, sectionProfile } from '../../tools/road-data/shared/road-profile.ts';

test("a Section's one bend keeps the grades at both its ends as the Section's length is written", () => {
  // One steep bend over the whole Section, 122.848318 m of stations written as 122.848322 m.
  const [from, to, size] = [1000, 1122.848318, 122.848322];
  const profile = profileOf([{ from, to, curvature: 0.001 }], [], [{ at: 0, change: -0.09 }]);
  const [start, pvi, end] = sectionProfile(profile, from, to, true, true, size);
  const along = (k) => k.s - from;
  // The tangents through the PVI hold the profile's grades at the Section's ends as written.
  assert.ok(Math.abs((pvi.y - start.y) / along(pvi) - profile.grade(from)) < 1e-12);
  assert.ok(Math.abs((end.y - pvi.y) / (size - along(pvi)) - profile.grade(to)) < 1e-12);
  // Its curve fits between the Section's ends.
  assert.ok(along(pvi) - pvi.curveLength / 2 >= 0 && along(pvi) + pvi.curveLength / 2 <= size);
});

test("a Section of one steep grade keeps it at both its ends as the Section's length is written", () => {
  // A grade of 0.55 from 1,000 m, the Section's 98.278655 m of stations written as 98.278657 m.
  const [from, to, size] = [1000, 1098.278655, 98.278657];
  const profile = profileOf([], [], [{ at: 0, change: 0.55 }]);
  const knots = sectionProfile(profile, from, to, true, true, size);
  const along = (k) => k.s - from;
  const [first, second] = knots,
    [last, end] = knots.slice(-2);
  assert.ok(Math.abs((second.y - first.y) / along(second) - 0.55) < 1e-12);
  assert.ok(Math.abs((end.y - last.y) / (size - along(last)) - 0.55) < 1e-12);
  assert.equal(end.y, profile.height(to));
});
