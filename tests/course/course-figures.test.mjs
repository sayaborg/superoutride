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
  // A lap gains what it loses, at least its climb each way, and turns at least once round; it parts nowhere.
  assert.ok(Math.abs(figures.ascentMeters - figures.descentMeters) < 0.5);
  assert.ok(figures.ascentMeters >= figures.climbMeters - 0.5);
  assert.ok(figures.turnRadians >= 2 * Math.PI);
  assert.equal(figures.partings, 0);
  // Its road, the drawing's lanes on asphalt.
  const { road } = figures;
  assert.ok(road.lanes.least >= 1 && road.lanes.least <= road.lanes.most);
  assert.ok(road.widthMeters.least > 8 && road.widthMeters.most < 20, JSON.stringify(road.widthMeters));
  assert.equal(road.surfaces[0].material, 'ASPHALT');
  assert.ok(Math.abs(road.surfaces.reduce((sum, surface) => sum + surface.share, 0) - 1) < 1e-9);
  // The index delivers them rounded.
  assert.equal(entry.figures.corners.left, figures.corners.left);
  assert.equal(entry.figures.longestStraightMeters, Math.round(figures.longestStraightMeters));
  assert.equal(entry.figures.ascentMeters, Number(figures.ascentMeters.toFixed(1)));
  assert.deepEqual(entry.figures.road.lanes, road.lanes);
});

test('every delivered course has figures: a level road has no climb, and a road with bends a tightest radius', () => {
  for (const { id, figures } of courses) {
    assert.equal(figures.climbMeters === 0, figures.steepestGrade === 0, id);
    assert.equal(figures.tightestRadiusMeters === null, figures.corners.left + figures.corners.right === 0, id);
    assert.equal(figures.climbMeters === 0, figures.ascentMeters + figures.descentMeters === 0, id);
  }
  // OUTRUN's roads part on the way to their goals, and ENDURO RACER's runs mostly on dirt.
  const of = (id) => courses.find((course) => course.id === id).figures;
  assert.ok(of('outrun-a').partings > 0);
  assert.equal(of('enduro-racer').road.surfaces[0].material, 'DIRT');
});
