import assert from 'node:assert/strict';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { commonPresentationDocument, presentationDemand } from '../helpers/course-common-presentation.mjs';

const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
const compile = async (f) => ok(await compileCourseDocument(f.document, f.inputs));
const qualify = (c, d = presentationDemand()) => compileCoursePresentationDomains(c.links, d);
const failure = (r, code) => {
  assert.equal(r.ok, false);
  assert.equal('value' in r, false);
  for (const issue of r.diagnostics) {
    assert.equal(issue.kind, 'qualification');
    assert.equal(issue.code, code);
  }
  return r.diagnostics;
};
const anchor = (s) => ({ kind: 'absolute', s });

test('actual images, phases, backgrounds, stamps and shared scenery qualify rotated LINEAR and every fork/merge Link', async () => {
  for (const name of ['linked-linear', 'fork-merge']) {
    const f = await commonPresentationDocument(name),
      before = structuredClone(f.document),
      c = await compile(f);
    const p = ok(qualify(c));
    assert.equal(p.scope, 'presentation-query-domain');
    assert.equal(p.links.length, c.links.length);
    p.links.forEach((link, i) => assert.equal(link, c.links[i]));
    assert.ok(Object.isFrozen(p));
    assert.ok(Object.isFrozen(p.demand.bounds));
    for (const link of c.links) {
      const a = createCourseGroundSource(link.source.section.presentation.ground),
        b = createCourseGroundSource(link.destination.section.presentation.ground);
      for (const ds of [-30, -25.0125, -0.0125, 0, 0.0125, 5.0125, 5.0375, 25.0125, 30])
        for (const dl of [-6, -4, -3.0125, 0, 0.0375, 1.0125, 1.0375, 2.0125, 3.9875, 4, 6])
          assert.equal(
            a.sample(link.source.anchor.s + ds, coursePortLateral(link.source) + dl),
            b.sample(link.destination.anchor.s + ds, coursePortLateral(link.destination) + dl),
            `RGB555 ${link.id} delta=${ds},l=${dl}`,
          );
    }
    assert.deepEqual(f.document, before);
    if (name === 'fork-merge') {
      assert.equal(c.sections.at(-1).incoming.length, 3);
      assert.equal(c.entry.bandPartition.bands.length, 3);
      assert.ok(c.sections.slice(1).every((s) => s.bandPartition.bands.length === 1));
    }
  }
});

test('a physical-only receipt cannot qualify absent presentation or visible unmatched siblings', async () => {
  const f = await commonPresentationDocument('fork-merge'),
    c = await compile(f),
    d = presentationDemand();
  const physical = {
    ...d,
    consumers: {
      contact: d.consumers.cameraRender,
      driverLookahead: d.consumers.cameraRender,
      reverseRecovery: d.consumers.cameraRender,
    },
  };
  ok(compileCoursePhysicalDomains(c.links, physical));
  d.consumers.cameraRender.left = 18;
  d.consumers.cameraRender.right = 18;
  const result = qualify(c, d);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((i) => [i.linkIndex, i.code]),
    [
      [0, 'coverage_gap'],
      [2, 'presentation_ground_mismatch'],
      [4, 'coverage_gap'],
    ],
  );
  // Widen source strips explicitly; the mismatch then identifies sibling paint, not source coverage.
  f.document.sections.forEach((s) => {
    s.presentation.ground.left = 50;
    s.presentation.ground.right = 50;
  });
  const wide = await compile(f);
  assert.deepEqual(
    failure(qualify(wide, d), 'presentation_ground_mismatch').map((i) => i.linkIndex),
    [0, 2, 4],
  );
  f.document.sections[0].presentation = null;
  assert.deepEqual(
    failure(qualify(await compile(f)), 'presentation_missing').map((i) => i.linkIndex),
    [0, 2, 4],
  );
});

test('the complete cell proof rejects interior paint intervals even with matching seam and guard endpoints', async () => {
  const f = await commonPresentationDocument();
  f.document.sections[1].presentation.ground.bands[0].sections.push(
    { anchor: anchor(73), paint: null },
    {
      anchor: anchor(73.0001),
      paint: structuredClone(f.document.sections[1].presentation.ground.bands[0].sections[0].paint),
    },
  );
  failure(qualify(await compile(f)), 'presentation_ground_mismatch');
});

test('image and A/B phase changes fail independently of pavement and material agreement', async () => {
  for (const [field, value] of [
    ['phaseS', 0.025],
    ['phaseL', 0.025],
  ]) {
    const f = await commonPresentationDocument();
    f.document.sections[1].presentation.ground.bands[0].sections[0].paint[field] = value;
    failure(qualify(await compile(f)), 'presentation_phase_mismatch');
  }
  const f = await commonPresentationDocument();
  f.document.sections[1].presentation.ground.bands[0].sections[0].paint.phaseS = 5;
  failure(qualify(await compile(f)), 'presentation_phase_mismatch');
});

test('background pan, outside GroundBase and environment changes remain presentation authorities', async () => {
  for (const edit of [
    (p) => {
      p.environments[0].background.yawOrigin += 1;
    },
    (p) => {
      p.environments[0].groundBaseRight = 0;
    },
    (p) => {
      p.environments.push({ ...structuredClone(p.environments[0]), anchor: anchor(73), name: 'other' });
    },
  ]) {
    const f = await commonPresentationDocument();
    edit(f.document.sections[1].presentation);
    failure(qualify(await compile(f)), 'presentation_environment_mismatch');
  }
});

test('ordered source-lattice stamps and canonical scenery identity cannot be replaced with lookalikes', async () => {
  const f = await commonPresentationDocument();
  f.document.sections[1].presentation.ground.stamps[0].l += 0.025;
  failure(qualify(await compile(f)), 'presentation_ground_mismatch');
  const g = await commonPresentationDocument();
  g.document.sceneryInstances.push({ id: 'lookalike', assetId: 'tree', paletteRgb555: null });
  g.document.sections[1].presentation.scenery[0].instanceId = 'lookalike';
  failure(qualify(await compile(g)), 'presentation_scenery_mismatch');
  const h = await commonPresentationDocument();
  h.document.sections[1].presentation.scenery[0].groundOffset += 0.01;
  failure(qualify(await compile(h)), 'presentation_scenery_mismatch');
});

test('all declared consumers include pose/step and every incoming merge is checked with independent diagnostics', async () => {
  const f = await commonPresentationDocument('fork-merge'),
    c = await compile(f),
    d = presentationDemand();
  d.pose.behind = 30;
  const issues = failure(qualify(c, d), 'coverage_gap');
  assert.equal(issues.length, 18);
  assert.deepEqual(
    issues.slice(0, 3).map((i) => i.consumer),
    ['cameraRender', 'groundFilter', 'scenery'],
  );
  f.document.sections[1].presentation.ground.baseRgb555 = 0;
  f.document.sections[3].presentation.ground.baseRgb555 = 1;
  const changed = await compile(f);
  const failures = failure(
    compileCoursePresentationDomains(changed.sections.at(-1).incoming, presentationDemand()),
    'presentation_ground_mismatch',
  );
  assert.deepEqual(
    failures.map((i) => i.linkIndex),
    [0, 2],
  );
});

test('qualification owns demand/list but shares immutable graph references and rejects API misuse', async () => {
  const c = await compile(await commonPresentationDocument()),
    d = presentationDemand(),
    links = [...c.links];
  const p = ok(compileCoursePresentationDomains(links, d));
  links.length = 0;
  d.pose.left = 100;
  assert.equal(p.links[0], c.links[0]);
  assert.equal(p.demand.pose.left, 1);
  assert.throws(() => p.links.pop(), TypeError);
  assert.throws(() => compileCoursePresentationDomains([c.links[0], c.links[0]], presentationDemand()), RangeError);
  assert.throws(() => compileCoursePresentationDomains([{ ...c.links[0] }], presentationDemand()), RangeError);
  assert.throws(() => compileCoursePresentationDomains(new Array(1), presentationDemand()), TypeError);
  const missing = presentationDemand();
  delete missing.consumers.groundFilter;
  const invalid = compileCoursePresentationDomains(c.links, missing);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].kind, 'input');
  assert.equal(invalid.diagnostics[0].path, '/demand/consumers');
});
