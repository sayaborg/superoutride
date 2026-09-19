import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { forkCourseDocument } from '../helpers/course-link-documents.mjs';

const original = JSON.parse(await readFile(new URL('../fixtures/linked-linear.course.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(original);
const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
const diagnostics = (r) => {
  assert.equal(r.ok, false);
  assert.equal('value' in r, false);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.diagnostics));
  assert.ok(r.diagnostics.every(Object.isFrozen));
  return r.diagnostics.map(({ code, path }) => ({ code, path }));
};

test('independent boundary and Section failures are collected in deterministic input order', async () => {
  const d = fixture();
  for (const b of d.sections[0].boundaries) b.knots.length = 1;
  d.sections[1].boundaries[0].knots[1].anchor = { kind: 'primitive', primitiveId: 'missing', fraction: 0.5 };
  d.sections[1].boundaries[1].knots.reverse();
  const before = structuredClone(d);
  const expected = [
    { code: 'invalid_boundary', path: '/sections/0/boundaries/0/knots' },
    { code: 'invalid_boundary', path: '/sections/0/boundaries/1/knots' },
    { code: 'unresolved_reference', path: '/sections/1/boundaries/0/knots/1/anchor/primitiveId' },
    { code: 'invalid_boundary', path: '/sections/1/boundaries/1/knots/1' },
  ];
  assert.deepEqual(diagnostics(await compileCourseDocument(d)), expected);
  assert.deepEqual(diagnostics(await compileCourseDocument(d)), expected);
  assert.deepEqual(d, before);
  d.sections[0] = structuredClone(original.sections[0]);
  assert.deepEqual(diagnostics(await compileCourseDocument(d)), expected.slice(2));
});

test('independent Link failures retain precise causes without downstream topology cascades', async () => {
  const d = forkCourseDocument(fixture(), 3);
  d.links[0].source.portId = 'missing-source';
  d.links[1].destination.portId = 'missing-destination';
  assert.deepEqual(diagnostics(await compileCourseDocument(d)), [
    { code: 'unresolved_reference', path: '/links/0/source/portId' },
    { code: 'unresolved_reference', path: '/links/1/destination/portId' },
  ]);
  const fixed = forkCourseDocument(fixture(), 3);
  const c = ok(await compileCourseDocument(fixed));
  assert.equal(c.entry.outgoing.length, 3);
  for (const l of c.links) {
    assert.ok(l.source.section.outgoing.includes(l));
    assert.ok(l.destination.section.incoming.includes(l));
  }
});

test('multiple failed authoring diagnostics preserve the prior publication atomically', async () => {
  const project = createCourseProject(),
    good = ok(await project.importDocument(JSON.stringify(original))),
    before = project.getState(),
    bad = fixture();
  for (const s of bad.sections) s.primitives = [];
  assert.deepEqual(diagnostics(await project.importDocument(JSON.stringify(bad))), [
    { code: 'empty_section', path: '/sections/0/primitives' },
    { code: 'empty_section', path: '/sections/1/primitives' },
  ]);
  assert.equal(project.getState(), before);
  assert.equal(ok(project.exportCompiled()), good);
  const repaired = ok(await project.importDocument(JSON.stringify(original)));
  assert.deepEqual(repaired.identity, good.identity);
  assert.deepEqual(repaired, good);
});

test('unexpected input access failures are not converted into authoring diagnostics', async () => {
  const d = fixture(),
    cause = new Error('unexpected input owner failure');
  Object.defineProperty(d.sections[1], 'boundaries', {
    get() {
      throw cause;
    },
  });
  await assert.rejects(compileCourseDocument(d), (error) => error === cause);
});
