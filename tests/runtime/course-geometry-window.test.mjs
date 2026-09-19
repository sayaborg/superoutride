import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { COURSE_DOCUMENT_LIMITS, readCourseDocument } from '../../dist/course/course-document.js';
import {
  compileCourseGeometryWindow,
  COURSE_GEOMETRY_WINDOW_LIMITS,
} from '../../dist/course/course-geometry-window.js';
import { guidePathToWorld, locateWorldOnGuideLocal } from '../../dist/core/guide-curve.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { sampleSurfaceGeometryAtCoordinate } from '../../dist/physics/vehicle-dynamics.js';
import { courseCapacityDocument } from '../helpers/course-capacity-documents.mjs';

const text = await readFile(new URL('../fixtures/transformed-loop.course.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(text);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

function crossing() {
  const input = fixture(),
    source = input.sections[0];
  input.type = 'LINEAR';
  input.links = [];
  source.ports = [];
  source.primitives[1].turn = 360;
  source.primitives.splice(2, 0, { ...source.primitives[1], id: 'second-circle' });
  source.height.splice(1, 0, { anchor: { kind: 'primitive', primitiveId: 'second-circle', fraction: 0 }, y: 8 });
  source.height.at(-1).y = 8;
  return input;
}

test('geographically repeated geometry admits distinct source intervals and qualified local windows', async () => {
  const course = ok(await compileCourseDocument(crossing())),
    source = course.entry;
  const positions = source.primitives.slice(1, 3).map((p) => p.sStart + (p.sEnd - p.sStart) / 4);
  const samples = positions.map((s) => guidePathToWorld(source.guide, s, 1));
  close(samples[0].x, samples[1].x);
  close(samples[0].z, samples[1].z);
  const surfaces = createBandSurfaceReader(source.bandPartition, source.physicalBindings);
  const observations = samples.map((sample, i) => {
    const interval = { sStart: positions[i] - 10, sEnd: positions[i] + 10 };
    const qualified = ok(compileCourseGeometryWindow(source, interval));
    assert.equal(qualified.source.raster, source.raster);
    assert.equal(qualified.source.guide, source.guide);
    assert.equal(qualified.source.bandPartition, source.bandPartition);
    const located = locateWorldOnGuideLocal(source.guide, sample, sample.segmentIndex, 5);
    close(located.s, positions[i]);
    close(located.l, 1);
    return sampleSurfaceGeometryAtCoordinate(source.guide, source.height, surfaces, located);
  });
  assert.ok(observations[1].point.y > observations[0].point.y + 1);
  assert.equal(observations[0].material, observations[1].material);
  assert.equal(course.sections.length, 1);
  const ambiguous = compileCourseGeometryWindow(source, { sStart: positions[0] - 10, sEnd: positions[1] + 10 });
  assert.equal(ambiguous.ok, false);
  assert.equal('value' in ambiguous, false);
  assert.deepEqual(
    ambiguous.diagnostics.map((d) => [d.mapping, d.code]),
    [
      ['raster', 'ambiguous_geometry'],
      ['guide', 'ambiguous_geometry'],
    ],
  );
  for (const diagnostic of ambiguous.diagnostics) {
    assert.equal('path' in diagnostic, false);
    assert.equal(diagnostic.intervals.length, 2);
    assert.ok(diagnostic.intervals[0].sEnd < diagnostic.intervals[1].sStart);
    assert.ok(Object.isFrozen(diagnostic.intervals[0]));
  }
});

test('geometry qualifications own their bounded data but reuse canonical immutable source readers', async () => {
  const source = ok(await compileCourseDocument(fixture())).entry;
  const facets = { raster: source.raster, guide: source.guide, bandPartition: source.bandPartition };
  const interval = { sStart: 20, sEnd: 150 };
  const product = ok(compileCourseGeometryWindow(facets, interval));
  facets.guide = null;
  interval.sStart = 70;
  assert.equal(product.source.guide, source.guide);
  assert.deepEqual(product.interval, { sStart: 20, sEnd: 150 });
  for (const value of [product, product.source, product.interval, product.cells]) assert.ok(Object.isFrozen(value));
  assert.throws(() => {
    product.interval.sStart = 70;
  }, TypeError);
  assert.deepEqual(ok(compileCourseGeometryWindow(source, product.interval)), product);
});

test('invalid window contracts throw type/domain exceptions; content ambiguity is structured', async () => {
  const source = ok(await compileCourseDocument(fixture())).entry;
  for (const interval of [null, {}, { sStart: '1', sEnd: 3 }])
    assert.throws(() => compileCourseGeometryWindow(source, interval), TypeError);
  for (const interval of [
    { sStart: 0, sEnd: Infinity },
    { sStart: -1, sEnd: 3 },
    { sStart: 1, sEnd: 1 },
    { sStart: NaN, sEnd: 3 },
    { sStart: 0, sEnd: source.raster.length + 1 },
  ])
    assert.throws(() => compileCourseGeometryWindow(source, interval), RangeError);
  const other = ok(await compileCourseDocument(fixture())).entry;
  assert.throws(
    () => compileCourseGeometryWindow({ ...source, bandPartition: other.bandPartition }, { sStart: 0, sEnd: 10 }),
    RangeError,
    'equal ruler lengths do not authorize a partition from a different compilation',
  );
  assert.throws(
    () => compileCourseGeometryWindow({ ...source, guide: other.guide }, { sStart: 0, sEnd: 10 }),
    RangeError,
  );
  assert.throws(() => compileCourseGeometryWindow(null, { sStart: 0, sEnd: 10 }), TypeError);
});

test('counterclockwise arcs and windows clipped inside varying-width Raster/Guide cells qualify', async () => {
  for (const turn of [-90, 90]) {
    const input = fixture();
    input.sections[0].primitives[1].turn = turn;
    const source = ok(await compileCourseDocument(input)).entry;
    const bend = source.primitives[1];
    for (const fraction of [0, 0.01, 0.125, 0.499, 0.9]) {
      const start = bend.sStart + (bend.sEnd - bend.sStart) * fraction;
      ok(compileCourseGeometryWindow(source, { sStart: start, sEnd: start + 7 }));
    }
  }
  const input = JSON.parse(await readFile(new URL('../fixtures/varying-linear.course.json', import.meta.url), 'utf8'));
  const source = ok(await compileCourseDocument(input)).entry;
  ok(compileCourseGeometryWindow(source, { sStart: 3, sEnd: source.raster.length - 3 }));
});

test('capacity work bounds reject oversized windows without certifying partial mappings', async () => {
  const source = ok(
    await compileCourseDocument(courseCapacityDocument(fixture(), 'primitive-limit', COURSE_DOCUMENT_LIMITS)),
  ).entry;
  assert.ok(source.raster.segments.length > COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping);
  const result = compileCourseGeometryWindow(source, { sStart: 0, sEnd: source.raster.length });
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.mapping, d.code]),
    [
      ['raster', 'resource_limit'],
      ['guide', 'resource_limit'],
    ],
  );
  const end = source.raster.vertexS[COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping];
  const exact = ok(compileCourseGeometryWindow(source, { sStart: 0, sEnd: end }));
  assert.deepEqual(exact.cells, {
    raster: COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping,
    guide: COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping,
  });
});

test('one source circuit admits long-curved content and exact primitive/segment ceilings', async () => {
  for (const name of ['long-curved', 'primitive-limit', 'raster-limit']) {
    const input = courseCapacityDocument(fixture(), name, COURSE_DOCUMENT_LIMITS);
    const course = ok(await compileCourseDocument(input)),
      source = course.entry;
    assert.equal(course.sections.length, 1);
    assert.equal(source.incoming[0], source.outgoing[0]);
    assert.equal(source.outgoing[0].destination.section, source);
    if (name === 'long-curved') {
      close(source.raster.length, 20800);
      assert.ok(source.raster.segments.length > 2048);
    } else if (name === 'primitive-limit') {
      assert.equal(source.primitives.length, COURSE_DOCUMENT_LIMITS.primitives);
      input.sections[0].primitives.push({ id: 'overflow', kind: 'straight', length: 1 });
      const invalid = readCourseDocument(input);
      assert.equal(invalid.ok, false);
      assert.equal(invalid.diagnostics[0].code, 'resource_limit');
    } else {
      assert.equal(source.raster.segments.length, COURSE_DOCUMENT_LIMITS.rasterSegments);
      input.sections[0].primitives.at(-1).length += 50;
      const invalid = await compileCourseDocument(input);
      assert.equal(invalid.ok, false);
      assert.equal(invalid.diagnostics[0].code, 'resource_limit');
      assert.equal(invalid.diagnostics[0].path, '/sections/0/primitives');
    }
  }
});
