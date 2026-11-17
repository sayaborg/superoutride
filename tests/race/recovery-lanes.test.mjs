import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseLaneField } from '../../src/race/course-lane-field.js';

// A recovery's lane runs on across the next seam (K, 2026-11-17). CHASE H.Q. 2 left narrows from six lanes to three at
// 1,758.46 m: its right three lanes end before the seam.
const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const course = await loadDeliveredCourse(content, 'chase-hq-2-left', materials);
const WIDTH = 1.8;

const builder = createCourseRoute(course.entry);
builder.extendThrough(Infinity);
const { route } = builder;
const field = createCourseLaneField(route);

test('before the narrowing seam a recovery takes the nearest lane that runs on', () => {
  // At 1,749.5 m lanes 3 (l 1.8 m) and 4 (l 5.4 m) are there but end before the seam; lane 2 (l -1.8 m) runs on.
  assert.equal(field.recoveryLane(1749.5, 2.5, WIDTH), 2);
  assert.equal(field.recoveryLane(1749.5, 10, WIDTH), 2);
  assert.equal(field.recoveryLane(1749.5, -5, WIDTH), 1);
  assert.ok(Math.abs(field.recoveryL(1749.5, 10, WIDTH) + 1.8) < 1e-6);
  assert.equal(field.recoveriesNotRunningOn, 0);
});

test('a recovery lane changes only where the nearest lane there ends before the next seam', () => {
  let same = 0,
    moved = 0;
  for (const occurrence of route.occurrences) {
    if (!route.occurrences[occurrence.ordinal + 1]) break;
    // The same occurrence on a Route that ends with it: there every lane is a candidate, as before this rule.
    const short = createCourseRoute(course.entry);
    while (short.route.occurrences.length <= occurrence.ordinal) short.extend();
    const before = createCourseLaneField(short.route);
    for (let s = occurrence.start + 1; s < occurrence.end - 0.5; s += 3)
      for (let l = -24; l <= 24; l += 3) {
        const old = before.recoveryLane(s, l, WIDTH),
          lane = field.recoveryLane(s, l, WIDTH);
        if (old === lane) {
          same++;
          continue;
        }
        moved++;
        const seam = { at: s, width: WIDTH };
        assert.notEqual(field.laneEnd(s, occurrence.end, { ...seam, lane: old }), null, `${s} m, l ${l} m`);
        assert.equal(field.laneEnd(s, occurrence.end, { ...seam, lane }), null, `${s} m, l ${l} m`);
      }
  }
  assert.ok(same > 0 && moved > 0, `${same} kept, ${moved} moved`);
  assert.equal(field.recoveriesNotRunningOn, 0);
});
