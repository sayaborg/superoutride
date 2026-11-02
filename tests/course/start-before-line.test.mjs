import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { normalizeCoursePositions } from '../../tools/authoring/course-joints.ts';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);

/** SUPER MONACO GP's circuit with its start gate moved into Section `to`, its slots `back` metres before its end. */
async function startIn(to, back = (k) => 100 + 4 * k) {
  const delivered = {
    ...content,
    bytes: async (kind, id) => {
      const bytes = await content.bytes(kind, id);
      if (kind !== 'course' || id !== 'super-monaco-gp') return bytes;
      const document = JSON.parse(new TextDecoder().decode(bytes));
      const [entry] = document.sections;
      const start = entry.gates.find((gate) => gate.kind === 'start');
      entry.gates = entry.gates.filter((gate) => gate !== start);
      const slots = (grid) => grid && grid.map((slot, k) => ({ ...slot, at: { joint: 'end', offset: -back(k) } }));
      const section = document.sections.find((s) => s.id === to);
      section.gates = [{ ...start, grid: slots(start.grid), bikeGrid: slots(start.bikeGrid) }, ...section.gates];
      return new TextEncoder().encode(JSON.stringify(normalizeCoursePositions(document).document));
    },
  };
  return loadDeliveredCourse(delivered, 'super-monaco-gp', materials);
}

const pose = (section, s, transform) => {
  const at = section.coordinates.toWorld(s, 0, createPlanCoordinateSample());
  return transformPlanarPoint(transform, { x: at.x, z: at.z });
};

test("a circuit's Route begins before its line, in the Section returning to its entry", async () => {
  const course = await startIn('sector-3');
  const last = course.sections.find((s) => s.id === 'sector-3');
  assert.equal(course.gates.start, last);
  const builder = createCourseRoute(course.entry, course.gates.start);
  const { route } = builder;
  const length = last.coordinates.domain.end;
  const [before, entry] = route.occurrences;
  assert.equal(route.start, -length);
  assert.deepEqual([before.section, before.start, before.end], [last, -length, 0]);
  assert.deepEqual([entry.section, entry.start, entry.incoming?.to.section], [course.entry, 0, course.entry]);
  // The Section before the line meets the entry in the world as the lap does.
  const end = pose(last, length, before.worldFromSection),
    origin = pose(course.entry, 0, entry.worldFromSection);
  assert.ok(Math.hypot(end.x - origin.x, end.z - origin.z) < 1e-6);
  builder.extendThrough(2 * length + 4000);
  const again = route.occurrences.find((o) => o.ordinal > 1 && o.section === last);
  assert.ok(Math.abs(again.repeatTurn) > 1);
  const there = pose(last, 0, again.worldFromSection),
    first = pose(last, 0, before.worldFromSection);
  assert.ok(Math.hypot(there.x - first.x, there.z - first.z) < 1e-3);
});

test('a start in any other Section than the entry or the one returning to it is refused', async () => {
  await assert.rejects(startIn('sector-2'), /start gate must belong to the entry Section/);
});
