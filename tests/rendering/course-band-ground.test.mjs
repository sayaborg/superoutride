import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse } from '../../tools/course/authoring-io.ts';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { createRegionSurfaceReader } from '../../src/course/region-surface-reader.js';
import { createBandGroundSampler, createBandRenderMetrics } from '../../src/view/band-ground-sampler.js';

test('visual Bands can erase all ground without changing structural Regions, support or material readings', async () => {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-coast.course.json', import.meta.url));
  const { document, images } = await loadCourse(file);
  const prepared = await compileCourseImages(document, images);
  const original = await compileCourseDocument(prepared.document, prepared.images);
  assert.ok(original.ok);
  const erased = structuredClone(prepared.document);
  for (const section of erased.sections) section.presentation.ground.bands = [];
  const replacement = await compileCourseDocument(erased, prepared.images);
  assert.ok(replacement.ok);
  const a = original.value.entry,
    b = replacement.value.entry;
  assert.deepEqual(a.regionPartition, b.regionPartition);
  const surfaceA = createRegionSurfaceReader(a.regionPartition, a.physicalBindings);
  const surfaceB = createRegionSurfaceReader(b.regionPartition, b.physicalBindings);
  for (const s of [0, 45, 350, 700, a.raster.length])
    for (const l of [-100, -8, -3, 0, 3, 8, 100]) assert.deepEqual(surfaceA.sample(s, l), surfaceB.sample(s, l));
  const pixels = new Uint32Array(320).fill(0xabcdef01);
  const sampler = createBandGroundSampler([
    { ground: b.presentation.ground, start: 0, occurrenceStart: 0, end: b.raster.length, lateralOrigin: 0 },
  ]);
  sampler.sampleSpan(pixels, 0, 320, 350, -40, 0.25, 32, 'EXACT-BOX', createBandRenderMetrics());
  assert.ok(
    pixels.every((p) => p === 0xabcdef01),
    'transparent plane must preserve the existing BG/Painter pixels',
  );

  const invalidText = structuredClone(document);
  invalidText.sections[0].presentation.ground.bands = [
    { kind: 'text', s: 40, l: 0, height: 7, text: 'lowercase', color: 32767 },
  ];
  assert.equal(readCourseDocument(invalidText).ok, false);
});
