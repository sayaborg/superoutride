import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { guidePathToWorld, locateWorldOnGuideLocal } from '../../dist/core/guide-curve.js';
import { guideCoordinateMetricsAt } from '../../dist/core/guide-coordinate-frame.js';
import { rasterPathToWorld } from '../../dist/core/raster-path.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { createCourseDrivingSource } from '../../dist/runtime/course-driving-view.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';

import { courseDrivingFixture, drivingWindow, ok } from '../helpers/course-driving-fixture.mjs';

function singleSource() {
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  return createCourseDrivingSource(
    ok(
      compileCoursePhysicalDomains([], {
        pose: { ...zero, left: 1, right: 1, ahead: 1, behind: 1 },
        step: zero,
        consumers: { contact: zero, driverLookahead: zero, reverseRecovery: zero },
      }),
    ),
    ok(
      compileCoursePresentationDomains([], {
        pose: { ...zero, left: 1, right: 1, ahead: 1, behind: 1 },
        step: zero,
        consumers: { cameraRender: zero, groundFilter: zero, scenery: zero },
      }),
    ),
  );
}

test('bounded Section readers share native geometry and height interpolation with stable source observations', async () => {
  const course = await courseDrivingFixture();
  const source = singleSource();
  const { view } = drivingWindow(course, { minS: 1100, maxS: 1200, maxAdvance: 2 });
  const result = ok(source.createView(view));
  assert.equal(result.frame, view.frame);
  assert.equal(result.range, view.activeRange);
  assert.equal(view.spans[0].occurrence.section.guide, course.entry.guide);
  assert.ok(result.metadata.rasterSegments < course.entry.raster.segments.length);
  for (const s of [1100, 1199.25, 1200, 1230.5, 1330]) {
    for (const l of [-3, 0, 5]) {
      const native = guidePathToWorld(course.entry.guide, s, l);
      assert.deepEqual(result.world.guide.toWorld(s, l), native);
      assert.deepEqual(
        result.world.guide.metricsAt(s, l, native.segmentIndex),
        guideCoordinateMetricsAt(course.entry.guide, s, l, native.segmentIndex),
      );
      assert.deepEqual(result.geometry.raster.toWorld(s, l), rasterPathToWorld(course.entry.raster, s, l));
      assert.deepEqual(
        result.world.height.samplePhysicsDifferential(s),
        course.entry.height.samplePhysicsDifferential(s),
      );
      assert.equal(result.world.height.sampleRender(s).y, course.entry.height.sampleRender(s).y);
      assert.deepEqual(
        result.world.guide.locateLocal(native, native.segmentIndex, 2, false),
        locateWorldOnGuideLocal(course.entry.guide, native, native.segmentIndex, 2, false),
      );
    }
  }
  assert.equal('sections' in result.world, false);
  assert.equal('segments' in result.world.guide, false);
  assert.equal('vertices' in result.geometry.raster, false);
  for (const value of [
    result,
    result.world,
    result.world.guide,
    result.world.height.nodes,
    result.geometry.raster.segments,
  ])
    assert.ok(Object.isFrozen(value));
});

test('insufficient windows reject projection candidates and real driver lookahead instead of shortening them', async () => {
  const course = await courseDrivingFixture();
  const traversal = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const extent = { behind: 10, ahead: 10 };
  const view = ok(
    createCourseGeometryView(traversal.snapshot(), {
      pose: { minS: 950, maxS: 950, maxAdvance: 0 },
      consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
    }),
  );
  const result = ok(singleSource().createView(view));
  const p = guidePathToWorld(course.entry.guide, 950, 0);
  assert.throws(() => result.world.guide.locateLocal(p, p.segmentIndex, 5, false), RangeError);
  assert.throws(
    () =>
      sampleRivalDrivingInput(result.world.guide, {
        course: { s: 950, l: 0 },
        ...p,
        yaw: p.heading,
        longitudinalSpeed: 30,
        lateralSpeed: 0,
      }),
    RangeError,
  );
  assert.throws(() => result.world.height.samplePhysics(961), RangeError);
  assert.throws(() => result.geometry.raster.toWorld(939, 0), RangeError);
});

test('a selected Link remains undrivable without full common-content qualification', async () => {
  const input = JSON.parse(await readFile(new URL('../fixtures/linked-linear.course.json', import.meta.url), 'utf8'));
  const course = ok(await compileCourseDocument(input));
  const traversal = createCourseGeometryTraversal(course.entry, {
    retainBehind: 300,
    selectAhead: 300,
    maxOccurrences: 3,
  });
  ok(traversal.select(traversal.snapshot().active, course.links[0]));
  const extent = { behind: 20, ahead: 20 };
  const view = ok(
    createCourseGeometryView(traversal.snapshot(), {
      pose: { minS: 200, maxS: 200, maxAdvance: 0 },
      consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
    }),
  );
  assert.equal(singleSource().createView(view).reason, 'unqualified_links');
  assert.equal(traversal.snapshot().active.section, course.entry);
});

test('closed pose endpoints include the earlier projection seed at a shared Guide station', async () => {
  const course = await courseDrivingFixture();
  const guide = course.entry.guide;
  const index = 18,
    s = guide.segments[index].sEnd;
  const { view } = drivingWindow(course, { minS: s, maxS: s, maxAdvance: 0 }, s);
  const result = ok(singleSource().createView(view));
  const point = guidePathToWorld(guide, s, 0);
  const expected = locateWorldOnGuideLocal(guide, point, index, 5, false);
  assert.deepEqual(result.world.guide.locateLocal(point, index, 5, false), expected);
  assert.ok(result.range.start <= guide.segments[index - 5].sStart);
});
