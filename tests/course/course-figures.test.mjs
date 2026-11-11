import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { COURSE_FIGURES, createCourseFigures } from '../../src/course/course-figures.js';

const content = await readDeliveredContent();
const courses = await loadCourseIndex(content);

test("a circuit's figures: its profile from its start, its climb over it, and its corners counted round its line", async () => {
  const entry = courses.find((course) => course.id === 'tsukuba');
  const course = await loadDeliveredCourse(content, entry.id, await loadSurfaceMaterials(content));
  const figures = createCourseFigures(course);
  assert.equal(figures.profile.length, COURSE_FIGURES.profileIntervals + 1);
  assert.equal(figures.profile[0], 0);
  assert.ok(Math.abs(figures.profile.at(-1)) < 0.5, 'a lap ends at its start');
  assert.ok(figures.climbMeters >= Math.max(...figures.profile) - Math.min(...figures.profile));
  // TSUKUBA runs clockwise: more of its turn is to the right, and its back straight is its longest.
  assert.ok(figures.corners.right > figures.corners.left && figures.corners.left > 0);
  assert.ok(figures.longestStraightMeters > 300 && figures.longestStraightMeters < 500);
  assert.ok(figures.tightestRadiusMeters > 10 && figures.tightestRadiusMeters < 40);
  // The index delivers them rounded.
  assert.equal(entry.figures.corners.left, figures.corners.left);
  assert.equal(entry.figures.longestStraightMeters, Math.round(figures.longestStraightMeters));
});

test('every delivered course has figures: a level road has no climb, and a road with bends a tightest radius', () => {
  for (const { id, figures } of courses) {
    assert.equal(figures.climbMeters === 0, figures.steepestGrade === 0, id);
    assert.equal(figures.tightestRadiusMeters === null, figures.corners.left + figures.corners.right === 0, id);
  }
});
