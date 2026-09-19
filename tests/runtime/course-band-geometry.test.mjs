import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileGuidePath } from '../../dist/core/guide-curve.js';
import { guideEnvelopeAt } from '../../dist/core/guide-envelope.js';
import { courseBoundaryAt, courseBandAt } from '../../dist/course/course-bands.js';
import { COURSE_DOCUMENT_LIMITS, parseCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseGeometryWindow } from '../../dist/course/course-geometry-window.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';

const text = await readFile(new URL('../fixtures/varying-linear.course.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(text);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const failure = (result, code, path) => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.equal(result.diagnostics[0].code, code);
  if (path) assert.equal(result.diagnostics[0].path, path);
  return result.diagnostics[0];
};

test('varying saved geometry replays canonical boundaries and keeps a distant wide straight out of a tight bend', async () => {
  const input = fixture();
  const saved = ok(saveCourseDocument(input));
  assert.deepEqual(ok(parseCourseDocument(saved)), input);
  const first = ok(await compileCourseDocument(input));
  assert.deepEqual(ok(await compileCourseDocument(ok(parseCourseDocument(saved)))), first);
  const section = first.sections[0];
  assert.equal(section.bandPartition.bands[0].right, section.bandPartition.bands[1].left);
  const bend = section.primitives[1],
    runout = section.primitives[2];
  assert.equal(guideEnvelopeAt(section.guide.envelope, (bend.sStart + bend.sEnd) / 2), 6);
  assert.equal(guideEnvelopeAt(section.guide.envelope, runout.sEnd), 62);
  const halfway = runout.sStart + 0.5 * (runout.sEnd - runout.sStart);
  for (const [boundary, expected] of section.boundaries.map((b, i) => [b, [-16.5, 5, 32][i]]))
    assert.ok(Math.abs(courseBoundaryAt(boundary, halfway) - expected) < 1e-12);
  assert.throws(
    () => compileGuidePath(section.raster, { lMax: 62, mMin: 0.25 }),
    RangeError,
    'one Section-wide width would reject this valid local chart',
  );
  const corners = section.guide.corners.filter((corner) => corner.trim > 0);
  for (const corner of corners) assert.equal(corner.radius, 20 * Math.cos(Math.abs(corner.turn) / 2));
  input.sections[0].boundaries.reverse();
  input.sections[0].bands.reverse();
  input.sections[0].carriageways[0].bandIds.reverse();
  const permuted = ok(await compileCourseDocument(input)).sections[0];
  for (const s of [0, halfway, runout.sEnd])
    for (const l of [-20, -1, 0, 3, 20, 70])
      assert.equal(courseBandAt(permuted.bandPartition, s, l)?.id, courseBandAt(section.bandPartition, s, l)?.id);
  assert.deepEqual(permuted.guide, section.guide, 'declaration order cannot change derived geometry');
});

test('all structural roles, shared edges, gaps and outer edges use exact half-open ownership', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.primitives = [{ id: 'runout', kind: 'straight', length: 100 }];
  const edges = [-12, -9, -5, -3, 0, 2, 6, 9, 12];
  source.boundaries = edges.map((l, i) => ({
    id: `edge-${i}`,
    knots: [
      { anchor: { kind: 'absolute', s: 0 }, l },
      { anchor: { kind: 'absolute', s: 100 }, l: l * 2 + 1 },
    ],
  }));
  const roles = ['shoulder', 'pavement', 'median', 'pavement', 'median', 'pavement', 'shoulder'];
  source.bands = roles.map((role, i) => ({
    id: `band-${i}`,
    start: { kind: 'absolute', s: 0 },
    end: { kind: 'absolute', s: 100 },
    leftBoundaryId: `edge-${i}`,
    rightBoundaryId: `edge-${i + 1}`,
    role,
  }));
  // Last band is separated by a genuine gap.
  source.bands[6].leftBoundaryId = 'edge-7';
  source.bands[6].rightBoundaryId = 'edge-8';
  source.carriageways = [1, 3, 5].map((i) => ({ id: `road-${i}`, bandIds: [`band-${i}`] }));
  source.physicalBindings = source.bands.map((b) => ({
    bandId: b.id,
    sections: [{ anchor: b.start, material: 'ASPHALT' }],
  }));
  const section = ok(await compileCourseDocument(input)).sections[0];
  for (const s of [0, 17, 50, 100]) {
    for (const band of section.bandPartition.bands) {
      const left = courseBoundaryAt(band.left, s),
        right = courseBoundaryAt(band.right, s);
      assert.notEqual(courseBandAt(section.bandPartition, s, left - 1e-10), band);
      assert.equal(courseBandAt(section.bandPartition, s, left), band);
      assert.equal(courseBandAt(section.bandPartition, s, left + 1e-10), band);
      assert.equal(courseBandAt(section.bandPartition, s, right - 1e-10), band);
      assert.notEqual(courseBandAt(section.bandPartition, s, right), band);
      assert.notEqual(courseBandAt(section.bandPartition, s, right + 1e-10), band);
    }
    assert.equal(courseBandAt(section.bandPartition, s, courseBoundaryAt(section.boundaries[6], s)), null);
    assert.equal(courseBandAt(section.bandPartition, s, courseBoundaryAt(section.boundaries[8], s)), null);
  }
  for (const s of [-1, 101, NaN]) {
    assert.throws(() => courseBoundaryAt(section.boundaries[0], s), RangeError);
    assert.throws(() => courseBandAt(section.bandPartition, s, 0), RangeError);
  }
  assert.throws(() => courseBandAt(section.bandPartition, 0, Infinity), RangeError);
});

test('interior knots, noncanonical touching boundaries and locally wide bends fail before publication', async () => {
  const crossing = fixture();
  crossing.sections[0].boundaries[0].knots[1].l = 2;
  failure(await compileCourseDocument(crossing), 'semantic_compile_failure', '/sections/0/bands');
  const duplicate = fixture(),
    s = duplicate.sections[0];
  s.boundaries.push({ ...structuredClone(s.boundaries[1]), id: 'same-curve' });
  s.bands[1].leftBoundaryId = 'same-curve';
  failure(await compileCourseDocument(duplicate), 'semantic_compile_failure', '/sections/0/bands');
  const wide = fixture();
  for (const knot of wide.sections[0].boundaries[2].knots) knot.l = 17;
  failure(await compileCourseDocument(wide), 'semantic_compile_failure', '/sections/0/guide');
});

test('mapped envelope detects local inversion and nonadjacent overlap with varying edges', async () => {
  const inverted = fixture();
  for (const knot of inverted.sections[0].boundaries[2].knots) knot.l = 30;
  const inversion = failure(await compileCourseDocument(inverted), 'semantic_compile_failure', '/sections/0/bands');
  assert.match(inversion.message, /inverts/);
  const overlapping = fixture();
  overlapping.sections[0].primitives[1].turn = 360;
  const source = ok(await compileCourseDocument(overlapping)).sections[0];
  const overlap = compileCourseGeometryWindow(source, { sStart: 0, sEnd: source.raster.length });
  assert.equal(overlap.ok, false);
  assert.ok(overlap.diagnostics.every((d) => d.code === 'ambiguous_geometry'));
  ok(compileCourseGeometryWindow(source, { sStart: 105, sEnd: 115 }));
});

test('boundary edits invalidate derived profiles; invalid import and caller mutation preserve the last product', async () => {
  const project = createCourseProject();
  const initial = ok(await project.importDocument(text));
  const prior = project.getState();
  const invalid = fixture();
  invalid.sections[0].boundaries[0].knots[1].l = 100;
  failure(await project.importDocument(ok(saveCourseDocument(invalid))), 'semantic_compile_failure');
  assert.equal(project.getState(), prior);
  const input = fixture();
  input.sections[0].boundaries[2].knots.at(-1).l = 70;
  ok(project.editDocument(input));
  failure(project.exportCompiled(), 'stale_source');
  const pending = project.compile();
  input.sections[0].boundaries[2].knots.at(-1).l = 80;
  const changed = ok(await pending);
  assert.notEqual(initial.identity.buildSha256, changed.identity.buildSha256);
  const section = changed.sections[0];
  assert.equal(guideEnvelopeAt(section.guide.envelope, section.raster.length), 72);
  assert.equal(courseBoundaryAt(section.boundaries[2], section.raster.length), 70);
  assert.throws(() => {
    section.boundaries[2].knots.at(-1).l = 900;
  }, TypeError);
  assert.throws(() => {
    section.guide.envelope.at(-1).lMax = 900;
  }, TypeError);
});

test('generated band partition is bounded independently of saved knot counts', async () => {
  const input = fixture(),
    section = input.sections[0];
  section.primitives = [
    { id: 'approach', kind: 'straight', length: 100 },
    ...Array.from({ length: Math.floor((COURSE_DOCUMENT_LIMITS.rasterSegments - 4) / 72) }, (_, i) => ({
      id: `circle-${i}`,
      kind: 'arc',
      radius: 20,
      turn: 360,
    })),
    { id: 'runout', kind: 'straight', length: 100 },
  ];
  section.boundaries = Array.from({ length: 18 }, (_, edge) => ({
    id: `edge-${edge}`,
    knots: Array.from({ length: 256 }, (_, i) => ({
      anchor:
        i === 255
          ? { kind: 'primitive', primitiveId: 'runout', fraction: 1 }
          : { kind: 'absolute', s: i === 0 ? 0 : (i * 18 + edge) / 46 },
      l: edge,
    })),
  }));
  section.bands = Array.from({ length: 17 }, (_, i) => ({
    id: `band-${i}`,
    start: { kind: 'absolute', s: 0 },
    end: { kind: 'primitive', primitiveId: 'runout', fraction: 1 },
    leftBoundaryId: `edge-${i}`,
    rightBoundaryId: `edge-${i + 1}`,
    role: 'pavement',
  }));
  section.carriageways = [{ id: 'road', bandIds: section.bands.map((b) => b.id) }];
  assert.ok(18 * 254 + (section.primitives.length - 2) * 72 > COURSE_DOCUMENT_LIMITS.bandCells);
  failure(await compileCourseDocument(input), 'resource_limit', '/sections/0/bands');
});
