import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { readCourseImages } from '../../tools/course/read-course-images.ts';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseFileSha256 } from '../../tools/course/course-file-id.ts';
import { courseImageNames, readCourseDocument, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { createStripGroundSampler, createStripRenderMetrics } from '../../src/view/strip-ground-sampler.js';

test('visual Strips can erase all ground without changing material slabs, support or material readings', async () => {
  const content = new URL('../../content/', import.meta.url);
  const read = await readCourseDocumentBytes(
    new Uint8Array(await readFile(new URL('courses/super-hang-on-africa.course.json', content))),
    'super-hang-on-africa.course.json',
  );
  assert.ok(read.ok);
  const document = read.value;
  const images = await readCourseImages(
    courseImageNames(document),
    async (name) => new Uint8Array(await readFile(new URL(`images/${name}`, content))),
  );
  const materials = await loadSurfaceMaterials(await readDeliveredContent());
  const prepared = await compileCourseImages(document, images);
  const original = await compileCourseDocument(
    prepared.document,
    'super-hang-on-africa',
    await courseFileSha256(prepared.document),
    prepared.images,
    materials,
  );
  assert.ok(original.ok);
  const erased = structuredClone(prepared.document);
  for (const section of erased.sections)
    section.strips = section.strips
      .filter((s) => s.kind === 'strip' && s.material !== null)
      .map((s) => ({ ...s, color: null }));
  const admitted = readCourseDocument(erased);
  assert.ok(admitted.ok);
  const replacement = await compileCourseDocument(
    admitted.value,
    'super-hang-on-africa',
    await courseFileSha256(admitted.value),
    prepared.images,
    materials,
  );
  assert.ok(replacement.ok);
  const a = original.value.entry,
    b = replacement.value.entry;
  assert.deepEqual(a.material.slabs, b.material.slabs);
  const surfaceA = a.material;
  const surfaceB = b.material;
  for (const s of [0, 45, 350, 700, a.coordinates.domain.end])
    for (const l of [-100, -8, -3, 0, 3, 8, 100]) assert.deepEqual(surfaceA.sample(s, l), surfaceB.sample(s, l));
  const sampler = createStripGroundSampler([
    { ground: b.color, start: 0, end: b.coordinates.domain.end, lateralOrigin: 0 },
  ]);
  for (const deltaS of [0, 32]) {
    // Bit 15 is never set in an RGB555 pixel.
    const pixels = new Uint16Array(320).fill(0x8000);
    sampler.sampleSpan(pixels, 0, 320, 350, -40, 0.25, deltaS, createStripRenderMetrics());
    assert.ok(
      pixels.every((p) => p === 0x8000),
      'transparent plane must preserve the existing BG/Painter pixels',
    );
  }

  const invalidText = structuredClone(document);
  invalidText.sections[0].strips = [
    {
      kind: 'text',
      at: { joint: document.sections[0].plan[0].id, offset: 40 },
      lateral: 0,
      height: 7,
      text: 'lowercase',
      color: 32767,
    },
  ];
  assert.equal(readCourseDocument(invalidText).ok, false);
});
