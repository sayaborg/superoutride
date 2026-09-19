import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { COURSE_DOCUMENT_LIMITS } from '../../dist/course/course-document.js';
import { compileCourseGeometryWindow } from '../../dist/course/course-geometry-window.js';
import { courseCapacityDocument } from '../../tests/helpers/course-capacity-documents.mjs';

const template = JSON.parse(
  await readFile(new URL('../../tests/fixtures/transformed-loop.course.json', import.meta.url)),
);
for (const name of ['long-curved', 'primitive-limit', 'raster-limit']) {
  const input = courseCapacityDocument(template, name, COURSE_DOCUMENT_LIMITS);
  const started = performance.now();
  const result = await compileCourseDocument(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const compileMilliseconds = performance.now() - started;
  const section = result.value.entry;
  const middle = section.raster.length / 2;
  const windowStarted = performance.now();
  const window = compileCourseGeometryWindow(section, { sStart: middle - 5, sEnd: middle + 5 });
  assert.equal(window.ok, true, JSON.stringify(window.diagnostics));
  const stations = new Set([
    ...section.raster.vertexS,
    ...section.boundaries.flatMap((b) => b.knots.map((k) => k.anchor.s)),
    ...section.bandPartition.bands.flatMap((b) => [b.start.s, b.end.s]),
  ]);
  console.log(
    JSON.stringify({
      name,
      scope: 'synthetic-host-diagnostic',
      sourceBytes: Buffer.byteLength(JSON.stringify(input)),
      length: section.raster.length,
      primitives: section.primitives.length,
      rasterSegments: section.raster.segments.length,
      bandCells: stations.size - 1,
      guideSegments: section.guide.segments.length,
      compileMilliseconds,
      windowMilliseconds: performance.now() - windowStarted,
      windowCells: window.value.cells,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
  );
}
