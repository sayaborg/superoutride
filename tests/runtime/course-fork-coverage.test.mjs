import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';

import { parseCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';

import { authoredForkDocument } from '../helpers/course-common-presentation.mjs';

const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
const compile = async (f) => ok(await compileCourseDocument(f.document, f.inputs));
const anchor = (s) => ({ kind: 'absolute', s });
test('saved fork anchors compile once to immutable canonical exits and median-center regions', async () => {
  const f = await authoredForkDocument(),
    before = structuredClone(f.document),
    c = await compile(f);
  const fork = c.entry.fork;
  assert.equal(fork.section, c.entry);
  assert.deepEqual(
    fork.regions.map(({ left, right }) => [left, right]),
    [
      [-18, -7],
      [-7, 7],
      [7, 18],
    ],
  );
  assert.deepEqual(
    fork.regions.map((r) => r.link),
    c.entry.outgoing,
  );
  assert.ok(Object.isFrozen(fork) && Object.isFrozen(fork.regions) && fork.regions.every(Object.isFrozen));
  assert.equal(fork.lock.s, 200);
  assert.equal(fork.closure.s, 750);
  assert.deepEqual(ok(parseCourseDocument(ok(saveCourseDocument(f.document)))), before);
  f.document.sections[0].fork.lock = anchor(250);
  assert.equal(fork.lock.s, 200);
  const reordered = structuredClone(before);
  reordered.links.reverse();
  reordered.sections.reverse();
  reordered.sections.forEach((s) => {
    s.bands.reverse();
    s.carriageways.reverse();
    s.boundaries.reverse();
    s.ports.reverse();
  });
  const other = await compile({ ...f, document: reordered });
  assert.deepEqual(
    other.entry.fork.regions.map((r) => [r.left, r.right, r.link.id]),
    fork.regions.map((r) => [r.left, r.right, r.link.id]),
  );
});

test('invalid fork ordering, hidden nonparallel boundaries, unsupported medians and absent control are explicit', async () => {
  for (const edit of [
    (d) => {
      d.sections[0].fork.closure = anchor(1400);
    },
    (d) => {
      d.sections[0].fork.lock = anchor(750);
    },
    (d) => {
      d.sections[1].fork = { lock: anchor(600), closure: anchor(700) };
    },
    (d) => {
      d.sections[0].physicalBindings.find((b) => b.bandId === 'median-0').sections[0].material = 'VOID';
    },
    (d) => {
      d.sections[0].boundaries[1].knots.splice(1, 0, { anchor: anchor(300), l: -9 });
    },
  ]) {
    const f = await authoredForkDocument();
    edit(f.document);
    const result = await compileCourseDocument(f.document, f.inputs);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, 'invalid_fork');
    assert.match(result.diagnostics[0].path, /\/fork$/);
  }
  const f = await authoredForkDocument();
  f.document.sections[0].fork = null;
  assert.equal((await compile(f)).entry.fork, null);
  delete f.document.sections[0].fork;
  const result = await compileCourseDocument(f.document, f.inputs);
  assert.equal(result.diagnostics[0].path, '/sections/0/fork');
});

test('two-exit controls retain canonical primitive anchors without a third region or successor copy', async () => {
  const f = await authoredForkDocument(),
    d = f.document,
    parent = d.sections[0];
  const removed = d.links.find((l) => l.source.sectionId === parent.id && l.source.portId === parent.ports.at(-1).id)
    .destination.sectionId;
  d.links = d.links.filter((l) => l.source.sectionId !== removed && l.destination.sectionId !== removed);
  d.sections = d.sections.filter((s) => s.id !== removed);
  parent.ports.pop();
  const removedBands = new Set(['road-2', 'median-1']);
  parent.bands = parent.bands.filter((b) => !removedBands.has(b.id));
  parent.bands.find((b) => b.id === 'approach').rightBoundaryId = 'road-1-right';
  parent.physicalBindings = parent.physicalBindings.filter((b) => !removedBands.has(b.bandId));
  parent.presentation.ground.bands = parent.presentation.ground.bands.filter((b) => !removedBands.has(b.bandId));
  parent.carriageways = parent.carriageways.filter((r) => !r.bandIds.some((id) => removedBands.has(id)));
  parent.fork.lock = { kind: 'primitive', primitiveId: parent.primitives[0].id, fraction: 0.1 };
  const c = await compile(f),
    fork = c.entry.fork;
  assert.equal(fork.lock.primitive, c.entry.primitives[0]);
  assert.equal(fork.lock.s, 200);
  assert.deepEqual(
    fork.regions.map((r) => [r.left, r.right]),
    [
      [-18, -7],
      [-7, 4],
    ],
  );
  assert.equal(c.sections.at(-1).incoming.length, 2);
});

test('fork source edits invalidate identity and failed fork compilation preserves the project', async () => {
  const f = await authoredForkDocument(),
    project = createCourseProject();
  const first = ok(await project.importDocument(ok(saveCourseDocument(f.document)), f.inputs));
  f.document.sections[0].fork.closure = anchor(700);
  const second = ok(await project.importDocument(ok(saveCourseDocument(f.document)), f.inputs));
  assert.notEqual(first.identity.buildSha256, second.identity.buildSha256);
  f.document.sections[0].fork.closure = anchor(1500);
  assert.equal((await project.importDocument(ok(saveCourseDocument(f.document)), f.inputs)).ok, false);
  assert.equal(project.getState().compiled, second);
});
