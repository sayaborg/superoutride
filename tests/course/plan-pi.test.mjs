import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileCourseGeometry, resolveCoursePosition } from '../../src/course/course-geometry.ts';
import { readCourseDocument } from '../../src/course/course-document.ts';
import { samplePlanPath } from '../../src/course/geometry/plan-path.ts';

const pi = (id, x, z, radius = 0) => ({ id, x, z, radius });
const compile = (pis) => compileCourseGeometry({ pis }, '/sections/0');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('PI geometry normalizes authored origin and heading; positions use arc midpoints', () => {
  const plan = compile([pi('a', 40, 70), pi('b', 140, 70, 20), pi('c', 140, -30)]);
  near(plan.length, 160 + 10 * Math.PI);
  near(plan.stations.get('b'), 80 + 5 * Math.PI);
  const start = samplePlanPath(plan, 0, {}),
    end = samplePlanPath(plan, plan.length, {});
  assert.deepEqual([start.x, start.z, start.heading], [0, 0, 0]);
  near(end.x, 100);
  near(end.z, 100);
  near(end.heading, Math.PI / 2);
  assert.deepEqual(resolveCoursePosition({ pi: 'b', offset: -5 }, plan.stations, plan.length, '/at'), {
    s: plan.stations.get('b') - 5,
  });
  assert.throws(
    () => resolveCoursePosition({ pi: 'missing', offset: 0 }, plan.stations, plan.length, '/at'),
    (error) => error.diagnostic?.code === 'unresolved_reference',
  );
  for (const [id, offset] of [
    ['a', -1],
    ['c', 1],
  ])
    assert.throws(
      () => resolveCoursePosition({ pi: id, offset }, plan.stations, plan.length, '/at'),
      (error) => error.diagnostic?.code === 'invalid_position',
    );
});

test('touching arcs compile without a zero-length line, while overlapping tangents fail', () => {
  const pis = [pi('a', 0, 0), pi('b', 0, 260, 260), pi('c', 520, 260, 260), pi('d', 520, 0)];
  const plan = compile(pis);
  assert.equal(plan.segments.length, 2);
  assert.ok(plan.segments.every((s) => s.geometry.kind === 'arc'));
  near(plan.length, 260 * Math.PI);
  pis[2].x = 519;
  assert.throws(
    () => compile(pis),
    (error) => error.diagnostic?.code === 'invalid_plan',
  );
});

test('invalid PI geometry fails at compilation', () => {
  for (const pis of [
    [],
    [pi('a', 0, 0)],
    [pi('a', 0, 0, 1), pi('b', 0, 100)],
    [pi('a', 0, 0), pi('b', 0, 0)],
    [pi('a', 0, 0), pi('b', 0, 100), pi('c', 100, 100)],
    [pi('a', 0, 0), pi('b', 0, 100, 10), pi('c', 0, 200)],
    [pi('a', 0, 0), pi('b', 0, 100, 10), pi('c', 0, 0)],
  ])
    assert.throws(
      () => compile(pis),
      (error) => error.diagnostic?.code === 'invalid_plan',
    );
});

test('v16 admission owns PI shape, finite ranges and Section-local identity', () => {
  const input = JSON.parse(readFileSync(new URL('../../content/courses/ribbon-coast.course.json', import.meta.url)));
  assert.equal(readCourseDocument(input).ok, true);
  for (const mutate of [
    (d) => {
      d.version = 15;
    },
    (d) => {
      d.sections[0].pis[0].x = Infinity;
    },
    (d) => {
      d.sections[0].pis[0].radius = -1;
    },
    (d) => {
      d.sections[0].pis[1].id = d.sections[0].pis[0].id;
    },
    (d) => {
      d.sections[0].height[0].at.offset = NaN;
    },
    (d) => {
      d.sections[0].height[0].at.extra = 1;
    },
  ]) {
    const d = structuredClone(input);
    mutate(d);
    assert.equal(readCourseDocument(d).ok, false);
  }
});
