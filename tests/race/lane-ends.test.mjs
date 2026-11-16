import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseLaneField } from '../../src/race/course-lane-field.js';
import { PLANNED_DRIVER } from '../../src/race/planned-driver.js';

// A lane that ends in a later Section than the driver's: CHASE H.Q. 2 right's lanes change in number from Section to
// Section, so a lane's end names its merge lane in the ending Section's lanes, while the driver moves in its own.
const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const course = await loadDeliveredCourse(content, 'chase-hq-2-right', materials);

test("every lane's end names a lane to merge toward beside the driver's own lane, where the driver is", () => {
  const builder = createCourseRoute(course.entry);
  const { route } = builder;
  builder.extendThrough(Infinity);
  const field = createCourseLaneField(route);
  const lanesAt = (s) => route.at(s).section.lanes.elements.filter((element) => element.kind === 'lane').length;
  let ahead = 0;
  for (let s = route.start; s < route.end - 1; s += 2) {
    const count = lanesAt(s);
    for (let lane = 0; lane < count; lane++) {
      const intent = { lane, at: s, width: 2 };
      const end = field.laneEnd(s, s + PLANNED_DRIVER.lookahead, intent);
      if (end?.merge === undefined || end.merge === null) continue;
      if (route.at(end.s) !== route.at(s)) ahead++;
      assert.ok(end.merge >= 0 && end.merge < count, `at ${s} m lane ${lane} merges toward ${end.merge} of ${count}`);
      assert.equal(Math.abs(end.merge - lane), 1, `at ${s} m lane ${lane} merges toward ${end.merge}`);
    }
  }
  // Lanes ending in a later Section were read.
  assert.ok(ahead > 0);
});
