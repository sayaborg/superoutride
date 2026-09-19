import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { compileCoursePhysicalDemand } from '../../dist/compiler/course-physical-demand.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { forkCourseDocument } from '../helpers/course-link-documents.mjs';

const linearText = await readFile(new URL('../fixtures/linked-linear.course.json', import.meta.url), 'utf8');
const demandText = await readFile(new URL('../fixtures/physical-demand.json', import.meta.url), 'utf8');
const demand = () => JSON.parse(demandText);
const linear = () => JSON.parse(linearText);
const fork = (count = 3) => forkCourseDocument(linear(), count);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.ok ? '' : result));
  return result.value;
};
function failures(result, code) {
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'value'), false);
  assert.ok(result.diagnostics.length > 0);
  result.diagnostics.forEach((issue) => assert.equal(issue.code, code));
  return result.diagnostics;
}
const anchor = (s) => ({ kind: 'absolute', s });
function frozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value));
  assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
  Object.values(value).forEach((item) => frozen(item, seen));
}

test('pose, step and each required physical consumer expand independently without hidden guard defaults', () => {
  const input = demand(),
    product = ok(compileCoursePhysicalDemand(input));
  assert.deepEqual(
    product.requirements.map(({ consumer, bounds }) => ({ consumer, bounds })),
    [
      { consumer: 'contact', bounds: { behind: 5, ahead: 9, left: 3.5, right: 3.5 } },
      { consumer: 'driverLookahead', bounds: { behind: 3, ahead: 26, left: 2.5, right: 2.5 } },
      { consumer: 'reverseRecovery', bounds: { behind: 23, ahead: 16, left: 5, right: 5 } },
    ],
  );
  assert.deepEqual(product.bounds, { behind: 23, ahead: 26, left: 5, right: 5 });
  input.step.ahead = 100;
  input.consumers.contact.left = 100;
  assert.equal(product.step.ahead, 4);
  assert.equal(product.requirements[0].footprint.left, 1);
  frozen(product);
});

test('every declared footprint is required and malformed authoring uses input diagnostics', () => {
  for (const edit of [
    () => null,
    (v) => {
      delete v.pose;
      return v;
    },
    (v) => {
      v.extra = true;
      return v;
    },
    (v) => {
      delete v.consumers.contact;
      return v;
    },
    (v) => {
      delete v.consumers.driverLookahead;
      return v;
    },
    (v) => {
      delete v.consumers.reverseRecovery;
      return v;
    },
    (v) => {
      v.pose.left = '2';
      return v;
    },
  ]) {
    const [issue] = failures(compileCoursePhysicalDemand(edit(demand())), 'invalid_shape');
    assert.equal(issue.kind, 'input');
    assert.ok(issue.path.startsWith('/demand'));
  }
  for (const n of [-1, NaN, Infinity]) {
    const input = demand();
    input.step.left = n;
    failures(compileCoursePhysicalDemand(input), 'invalid_numeric_domain');
  }
  const huge = demand();
  huge.pose.left = Number.MAX_VALUE;
  huge.step.left = Number.MAX_VALUE;
  failures(compileCoursePhysicalDemand(huge), 'invalid_numeric_domain');
});

test('two/three-way forks and all incoming shared-successor Links qualify without copying or deleting sibling roads', async () => {
  for (const count of [2, 3]) {
    const input = fork(count),
      before = structuredClone(input);
    const course = ok(await compileCourseDocument(input));
    const qualification = ok(compileCoursePhysicalDomains(course.links, demand()));
    assert.equal(qualification.scope, 'physical-query-domain');
    assert.equal(qualification.links.length, count * 2);
    assert.equal(qualification.recipe, course.identity.compiler.physical.overlap);
    qualification.links.forEach((link, i) => assert.equal(link, course.links[i]));
    assert.equal(course.entry.bandPartition.bands.length, count);
    for (const child of course.sections.slice(1)) assert.equal(child.bandPartition.bands.length, 1);
    assert.equal(course.sections.at(-1).incoming.length, count);
    assert.deepEqual(input, before);
    frozen(qualification);
  }
});

test('qualification owns the demand and Link list while sharing canonical readers and materials', async () => {
  const course = ok(await compileCourseDocument(fork())),
    links = [...course.links],
    input = demand();
  const product = ok(compileCoursePhysicalDomains(links, input));
  links.length = 0;
  input.pose.left = 100;
  assert.equal(product.links.length, 6);
  assert.equal(product.links[0].source.section, course.entry);
  assert.equal(product.demand.pose.left, 2);
  assert.throws(() => product.links.pop(), TypeError);
  assert.throws(() => {
    product.demand.bounds.left = 0;
  }, TypeError);
  assert.throws(() => compileCoursePhysicalDomains([course.links[0], course.links[0]], demand()), RangeError);
  assert.throws(() => compileCoursePhysicalDomains([{ ...course.links[0] }], demand()), RangeError);
  assert.throws(() => compileCoursePhysicalDomains(null, demand()), TypeError);
  assert.throws(() => compileCoursePhysicalDomains([null], demand()), TypeError);
});

test('expanded guards include pose and step; exact fit passes and each undersized consumer reports independently', async () => {
  const course = ok(await compileCourseDocument(fork()));
  for (const consumer of ['contact', 'driverLookahead', 'reverseRecovery']) {
    const input = demand();
    input.consumers[consumer].ahead = 24;
    ok(compileCoursePhysicalDomains(course.links, input));
    input.consumers[consumer].ahead += 1e-8;
    const issues = failures(compileCoursePhysicalDomains(course.links, input), 'coverage_gap');
    assert.equal(issues.length, course.links.length);
    issues.forEach((issue, i) => {
      assert.equal(issue.kind, 'qualification');
      assert.equal(issue.linkIndex, i);
      assert.equal(issue.consumer, consumer);
      assert.equal(Object.hasOwn(issue, 'path'), false);
    });
  }
  const input = demand();
  input.pose.behind = 40;
  const issues = failures(compileCoursePhysicalDomains(course.links, input), 'coverage_gap');
  assert.equal(issues.length, course.links.length * 3);
  assert.deepEqual(
    issues.slice(0, 3).map((v) => v.consumer),
    ['contact', 'driverLookahead', 'reverseRecovery'],
  );
});

test('nonselected support cannot be hidden when any declared physical consumer can query it', async () => {
  const course = ok(await compileCourseDocument(fork()));
  for (const consumer of ['contact', 'driverLookahead', 'reverseRecovery']) {
    const input = demand();
    input.consumers[consumer].left = 20;
    input.consumers[consumer].right = 20;
    const issues = failures(compileCoursePhysicalDomains(course.links, input), 'physical_support_mismatch');
    assert.deepEqual(
      issues.map((v) => v.linkIndex),
      [0, 2, 4],
    );
  }
});

test('every incoming merge Link is checked and independent content failures are collected in supplied order', async () => {
  const input = fork();
  input.sections[1].physicalBindings[0].sections[0].material = 'DIRT';
  input.sections[3].physicalBindings[0].sections[0].material = 'GRASS';
  const course = ok(await compileCourseDocument(input));
  const incoming = course.sections.at(-1).incoming;
  const issues = failures(compileCoursePhysicalDomains(incoming, demand()), 'physical_support_mismatch');
  assert.deepEqual(
    issues.map((v) => v.linkIndex),
    [0, 2],
  );
  const all = failures(compileCoursePhysicalDomains(course.links, demand()), 'physical_support_mismatch');
  assert.deepEqual(
    all.map((v) => v.linkIndex),
    [0, 1, 4, 5],
  );
  assert.equal(ok(compileCoursePhysicalDomains([incoming[1]], demand())).links[0], incoming[1]);
});

test('domain qualification rejects an interior material interval even when seam and both guard ends agree', async () => {
  const input = linear();
  input.sections[1].physicalBindings[0].sections.push(
    { anchor: anchor(73), material: 'GRASS' },
    { anchor: anchor(73.001), material: 'ASPHALT' },
  );
  const course = ok(await compileCourseDocument(input));
  failures(compileCoursePhysicalDomains(course.links, demand()), 'physical_support_mismatch');
});

test('height agreement and horizontal whole-guard geometry remain mandatory for a narrow physical domain', async () => {
  for (const [height, code] of [
    [
      [
        [0, 1],
        [300, 1],
      ],
      'physical_height_mismatch',
    ],
    [
      [
        [0, 0],
        [70, 0],
        [71, 1],
        [72, 0],
        [300, 0],
      ],
      'nonhorizontal_overlap',
    ],
  ]) {
    const input = linear();
    input.sections[1].height = height.map(([s, y]) => ({ anchor: anchor(s), y }));
    failures(compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, demand()), code);
  }
});

test('lateral domain crossings partition moving support boundaries rather than checking clipped cell endpoints only', async () => {
  const input = linear();
  // Clipped endpoints and the seam agree, but the edges enter the domain at different interior stations.
  for (const [i, section] of input.sections.entries()) {
    const origin = i === 0 ? 1 : -5;
    const points =
      i === 0
        ? [
            [0, 6],
            [170, 6],
            [230, 10],
            [300, 10],
          ]
        : [
            [0, 6],
            [30, 6],
            [90, 11],
            [300, 11],
          ];
    section.boundaries.push({ id: 'outer', knots: points.map(([s, l]) => ({ anchor: anchor(s), l: l + origin })) });
    section.bands.push({
      id: 'shoulder',
      start: anchor(0),
      end: anchor(300),
      leftBoundaryId: section.boundaries[1].id,
      rightBoundaryId: 'outer',
      role: 'shoulder',
    });
    section.physicalBindings.push({ bandId: 'shoulder', sections: [{ anchor: anchor(0), material: 'GRASS' }] });
  }
  const envelope = demand();
  envelope.consumers.reverseRecovery.right = 4.5; // expanded right edge = 7
  failures(
    compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, envelope),
    'physical_support_mismatch',
  );
  input.sections[1].boundaries
    .at(-1)
    .knots.slice(-2)
    .forEach((knot) => {
      knot.l = 5;
    });
  ok(compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, envelope));
});

test('unrepresentable crossings outside an active Link guard cannot invalidate matching local content', async () => {
  const input = linear();
  for (const [i, section] of input.sections.entries()) {
    const origin = i === 0 ? 1 : -5;
    const points =
      i === 0
        ? [
            [0, 6],
            [1, 6],
            [1 + Number.EPSILON, 8],
            [300, 8],
          ]
        : [
            [0, 8],
            [300, 8],
          ];
    section.boundaries.push({ id: 'outer', knots: points.map(([s, l]) => ({ anchor: anchor(s), l: l + origin })) });
    section.bands.push({
      id: 'shoulder',
      start: anchor(0),
      end: anchor(300),
      leftBoundaryId: section.boundaries[1].id,
      rightBoundaryId: 'outer',
      role: 'shoulder',
    });
    section.physicalBindings.push({ bandId: 'shoulder', sections: [{ anchor: anchor(0), material: 'GRASS' }] });
  }
  const envelope = demand();
  envelope.consumers.reverseRecovery.right = 4.5;
  ok(compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, envelope));
});

test('closed domain edges keep exact half-open ownership, including a zero-area clipped sibling', async () => {
  const course = ok(await compileCourseDocument(fork(2)));
  const input = demand();
  input.consumers.reverseRecovery.right = 7.5; // bound 10: next road starts exactly there for fork-0
  const issues = failures(compileCoursePhysicalDomains(course.links, input), 'physical_support_mismatch');
  assert.deepEqual(
    issues.map((v) => v.linkIndex),
    [0],
  );
  input.consumers.reverseRecovery.right -= 1e-6;
  ok(compileCoursePhysicalDomains(course.links, input));
});

test('ordinary product surface readers agree throughout every qualified fork/merge domain', async () => {
  const course = ok(await compileCourseDocument(fork()));
  const proof = ok(compileCoursePhysicalDomains(course.links, demand()));
  for (const link of proof.links) {
    const a = createBandSurfaceReader(link.source.section.bandPartition, link.source.section.physicalBindings);
    const b = createBandSurfaceReader(
      link.destination.section.bandPartition,
      link.destination.section.physicalBindings,
    );
    for (const delta of [-30, -23, -0.01, 0, 0.01, 26, 30])
      for (const l of [-5, -4, -3.999, 0, 3.999, 4, 5])
        assert.equal(
          a.sample(link.source.anchor.s + delta, coursePortLateral(link.source) + l).material,
          b.sample(link.destination.anchor.s + delta, coursePortLateral(link.destination) + l).material,
        );
  }
});

test('arbitrary IDs, declaration order and separately rebuilt graph products preserve qualification values', async () => {
  const input = fork();
  const names = new Map(input.sections.map((section, i) => [section.id, `__proto__/区間 ${i}~`]));
  input.entrySectionId = names.get(input.entrySectionId);
  input.sections.forEach((section) => {
    section.id = names.get(section.id);
  });
  input.links.forEach((link, i) => {
    link.id = `constructor/接続 ${i}~`;
    link.source.sectionId = names.get(link.source.sectionId);
    link.destination.sectionId = names.get(link.destination.sectionId);
  });
  const a = ok(compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, demand()));
  input.sections.reverse();
  input.links.reverse();
  for (const section of input.sections) {
    section.bands.reverse();
    section.boundaries.reverse();
    section.physicalBindings.reverse();
    section.carriageways.reverse();
  }
  const b = ok(compileCoursePhysicalDomains(ok(await compileCourseDocument(input)).links, demand()));
  assert.deepEqual(a.demand, b.demand);
  assert.deepEqual(
    a.links.map((v) => v.id),
    b.links.map((v) => v.id).reverse(),
  );
  assert.notEqual(a.links[0], b.links.at(-1));
});
