import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseRouteReaders } from '../../src/course/course-route-readers.js';
import { createCourseRouteVisualReaders } from '../../src/view/course-route-visual-readers.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { wrapAngle } from '../../src/core/math.js';
import { backgroundPan } from '../../src/view/tile-background.js';

const LAPS = 3;

test('the sky moves only as the camera turns: across the yaw wrap, Section borders, lap lines and within changes', async () => {
  const content = await readDeliveredContent();
  const materials = await loadSurfaceMaterials(content);
  const camera = { focalLength: CAMERA_DEFINITION.focalLength };
  const ids = (
    await Promise.all(
      ['courses/', 'originals/courses/'].map((place) => readdir(new URL(`../../content/${place}`, import.meta.url))),
    )
  )
    .flat()
    .filter((name) => name.endsWith('.course.json'))
    .map((name) => name.slice(0, -'.course.json'.length));
  for (const id of ids) {
    const course = await loadDeliveredCourse(content, id, materials);
    const builder = createCourseRoute(course.entry);
    for (let laps = 0; ;) {
      const link = builder.route.occurrences.at(-1).section.outgoing[0];
      if (!link) break;
      if (link.to.section === course.entry && ++laps >= (course.type === 'CIRCUIT' ? LAPS : 1)) break;
      builder.select(link);
    }
    const route = builder.route;
    const coordinates = createCourseRouteReaders(route).coordinates;
    const visual = createCourseRouteVisualReaders(route).read();
    const sample = createPlanCoordinateSample();
    const view = (s) => {
      coordinates.toWorld(s, 0, sample);
      // The engine's camera yaw: wrapped, turned a little off the road.
      const yaw = wrapAngle(sample.heading + 0.2 * Math.sin(s / 37));
      const { from, to } = visual.skyAt(s);
      const skyYaw = visual.skyYawAt(s, yaw);
      // Within a change the old sky too, each by its own scroll.
      return {
        s,
        yaw,
        image: to.image,
        x: backgroundPan(to, skyYaw, camera),
        old: from && { s, yaw, image: from.image, x: backgroundPan(from, skyYaw, camera) },
      };
    };
    const compare = (a, b) => {
      if (a.image !== b.image) return;
      const width = a.image.width;
      let moved = b.x - a.x;
      moved -= width * Math.round(moved / width);
      const turned = camera.focalLength * wrapAngle(b.yaw - a.yaw);
      assert.ok(
        Math.abs(moved - turned) <= 1,
        `${id} at ${a.s.toFixed(2)}–${b.s.toFixed(2)} m: the sky moved ${moved} px for ${turned.toFixed(2)} px of turn`,
      );
    };
    for (const occurrence of route.occurrences.slice(1)) {
      compare(view(occurrence.start - 0.01), view(occurrence.start + 0.01));
    }
    let previous = view(0);
    for (let s = 2; s < route.end; s += 2) {
      const next = view(s);
      compare(previous, next);
      if (previous.old && next.old) compare(previous.old, next.old);
      previous = next;
    }
  }
});
