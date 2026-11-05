import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { readCourseImages } from '../../tools/course/read-course-images.ts';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { courseFileSha256 } from '../../tools/course/course-file-id.ts';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseImageNames, readCourseDocument, readCourseDocumentBytes } from '../../src/course/course-document.js';

const content = new URL('../../content/originals/', import.meta.url);
const materials = await loadSurfaceMaterials(await readDeliveredContent());
const read = readCourseDocumentBytes(
  new Uint8Array(await readFile(new URL('courses/pole-position-ii-fuji.course.json', content))),
  'pole-position-ii-fuji.course.json',
);
assert.ok(read.ok);
const prepared = await compileCourseImages(
  read.value,
  await readCourseImages(
    courseImageNames(read.value),
    async (name) => new Uint8Array(await readFile(new URL(`images/${name}`, content))),
  ),
);

/** The course compiled with its first solid placement's body made `body` (its old one handed to it). */
async function compiled(body) {
  const document = structuredClone(prepared.document);
  const [section, index] = document.sections
    .map((s, i) => [i, s.sprites.findIndex((e) => e.kind === 'sprite' && e.body?.length === 1)])
    .find(([, k]) => k >= 0);
  const placement = document.sections[section].sprites[index];
  if (body) placement.body = body(placement.body);
  const admitted = readCourseDocument(document);
  if (!admitted.ok) return { admitted };
  const result = await compileCourseDocument(
    admitted.value,
    'body-parts',
    await courseFileSha256(admitted.value),
    prepared.images,
    materials,
  );
  return { admitted, result, section: document.sections[section].id };
}

test("a body of two parts gives two solid objects, each its part's middle and width", async () => {
  const before = await compiled(null);
  const after = await compiled(([part]) => [
    { ...part, across: -0.25, width: part.width / 2 },
    { ...part, across: 0.25, width: part.width / 2 },
  ]);
  assert.ok(before.result.ok && after.result.ok);
  // The objects one compile has and the other lacks: the placement's one part, and its two.
  const objects = (r) =>
    r.result.value.sections
      .find((s) => s.id === before.section)
      .objects.map((o) => JSON.stringify([o.s, o.l, o.width, o.bottom, o.top, o.sprite]));
  const [was, now] = [objects(before), objects(after)];
  const only = (a, b) => a.filter((o) => !b.includes(o)).map((o) => JSON.parse(o));
  const [[s, l, width, bottom, top, sprite]] = only(was, now);
  assert.deepEqual(
    only(now, was),
    [-0.25, 0.25].map((across) => [s, l + across, width / 2, bottom, top, sprite]),
  );
  assert.equal(now.length, was.length + 1);
});

test('a movable body is one part on its lateral, and a part stands within its picture', async () => {
  const movable = { mass: 50, launchDegrees: 30, knocked: { airborne: 'a', landed: 'b' } };
  const { admitted } = await compiled(([part]) => [{ ...part, movable }, part]);
  assert.equal(admitted.ok, false);
  assert.deepEqual(
    admitted.diagnostics.map((d) => [d.code, d.path.replace(/^.*\/body/, '/body')]),
    [['invalid_placement', '/body/0/movable']],
  );
  const { result } = await compiled(([part]) => [{ ...part, across: 50 }]);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.path.replace(/^.*\/body/, '/body')]),
    [['invalid_placement', '/body/0/across']],
  );
});
