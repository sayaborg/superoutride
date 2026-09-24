import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCourse } from '../../tools/course/authoring-io.ts';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { createBandGroundSampler, createBandRenderMetrics } from '../../src/view/band-ground-sampler.js';

test('visual Strips can erase all ground without changing material slabs, support or material readings', async () => {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-coast.course.json', import.meta.url));
  const { document, images } = await loadCourse(file);
  const prepared = await compileCourseImages(document, images);
  const original = await compileCourseDocument(prepared.document, prepared.images);
  assert.ok(original.ok);
  const erased = structuredClone(prepared.document);
  for (const section of erased.sections)
    section.strips = section.strips
      .filter((s) => s.kind === 'strip' && s.material !== null)
      .map((s) => ({ ...s, color: null }));
  const replacement = await compileCourseDocument(erased, prepared.images);
  assert.ok(replacement.ok);
  const a = original.value.entry,
    b = replacement.value.entry;
  assert.deepEqual(a.material.slabs, b.material.slabs);
  const surfaceA = a.material;
  const surfaceB = b.material;
  for (const s of [0, 45, 350, 700, a.coordinates.domain.end])
    for (const l of [-100, -8, -3, 0, 3, 8, 100]) assert.deepEqual(surfaceA.sample(s, l), surfaceB.sample(s, l));
  const pixels = new Uint32Array(320).fill(0xabcdef01);
  const sampler = createBandGroundSampler([
    { ground: b.color, start: 0, end: b.coordinates.domain.end, lateralOrigin: 0 },
  ]);
  sampler.sampleSpan(pixels, 0, 320, 350, -40, 0.25, 32, 'EXACT-BOX', createBandRenderMetrics());
  assert.ok(
    pixels.every((p) => p === 0xabcdef01),
    'transparent plane must preserve the existing BG/Painter pixels',
  );

  const invalidText = structuredClone(document);
  invalidText.sections[0].strips = [
    {
      kind: 'text',
      at: { pi: document.sections[0].pis[0].id, offset: 40 },
      lateral: 0,
      height: 7,
      text: 'lowercase',
      color: 32767,
    },
  ];
  assert.equal(readCourseDocument(invalidText).ok, false);
});
