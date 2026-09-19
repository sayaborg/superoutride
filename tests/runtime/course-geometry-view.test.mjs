import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { transformPlanarPoint, transformPlanarVector } from '../../dist/core/planar-transform.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { forkCourseDocument } from '../helpers/course-link-documents.mjs';

const saved = await Promise.all(
  ['linked-linear', 'transformed-loop'].map((name) =>
    readFile(new URL(`../fixtures/${name}.course.json`, import.meta.url), 'utf8'),
  ),
);
const fixture = (i = 0) => JSON.parse(saved[i]);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.ok ? '' : result));
  return result.value;
};
const close = (a, b, tolerance = 1e-8) =>
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < tolerance, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
function demand(s, behind = 20, ahead = 20) {
  const extent = { behind, ahead };
  return {
    pose: { minS: s, maxS: s, maxAdvance: 0 },
    consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
  };
}
const compile = async (input = fixture()) => ok(await compileCourseDocument(input));

function frozen(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  assert.ok(Object.isFrozen(value));
  assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
  Object.values(value).forEach((child) => frozen(child, visited));
}

test('occurrences retain canonical visited Links, separate source reuse from identity and reverse the actual frame', async () => {
  const course = await compile();
  const traversal = createCourseGeometryTraversal(course.entry, 300);
  const before = traversal.snapshot(),
    forward = ok(traversal.forward(course.links[0]));
  assert.equal(forward.from, before.active);
  assert.equal(forward.to.incoming, course.links[0]);
  assert.equal(forward.to.section, course.links[0].destination.section);
  assert.equal(forward.destinationFromSource, course.links[0].destinationFromSource);
  assert.equal(before.occurrences.length, 1);
  const reversed = ok(traversal.reverse());
  assert.equal(reversed.to, before.active);
  const point = { x: 12.3, z: -58.8 },
    vector = { x: 3, z: 11 };
  close(
    transformPlanarPoint(reversed.destinationFromSource, transformPlanarPoint(forward.destinationFromSource, point)),
    point,
  );
  close(
    transformPlanarVector(reversed.destinationFromSource, transformPlanarVector(forward.destinationFromSource, vector)),
    vector,
  );
  assert.equal(
    ok(traversal.forward(course.links[0])).to,
    forward.to,
    're-entry retains the recorded occurrence identity',
  );
  frozen(traversal.snapshot());
  assert.equal(course.entry.outgoing[0], course.links[0]);
});

test('failed traversal leaves state intact and never accepts an ID-equivalent Link from another compilation', async () => {
  const a = await compile(),
    b = await compile();
  const traversal = createCourseGeometryTraversal(a.entry, 100);
  const initial = traversal.snapshot();
  assert.equal(traversal.forward(b.links[0]).ok, false);
  assert.equal(traversal.reverse().ok, false);
  assert.equal(traversal.snapshot().active, initial.active);
  assert.equal(traversal.snapshot().occurrences, initial.occurrences);
  assert.throws(() => createCourseGeometryTraversal(a.entry, '100'), TypeError);
  for (const value of [-1, Infinity, NaN])
    assert.throws(() => createCourseGeometryTraversal(a.entry, value), RangeError);
});

test('a transformed view shares one source address for narrow Raster/Guide readers and Band classification', async () => {
  const course = await compile(),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  ok(traversal.forward(course.links[0]));
  ok(traversal.reverse());
  const request = demand(200, 25, 35),
    view = ok(createCourseGeometryView(traversal.snapshot(), request));
  assert.equal(view.frame, traversal.snapshot().active);
  assert.equal(view.scope, 'geometry-only');
  assert.equal(view.length, 60);
  assert.equal(view.spans.length, 2);
  assert.equal(view.spans[1].occurrence.section, course.sections[1]);
  assert.equal(view.address(25, 1).sourceS, 60);
  close({ x: view.address(25, 1).sourceL, z: 0 }, { x: -5, z: 0 });
  for (const s of [0, 24.999999, 25, 25.000001, 48.3, 60]) {
    for (const l of [-4, 0, 1, 5.999, 6]) {
      for (const reader of [view.geometry.rasterAt, view.geometry.guideAt]) {
        close(reader(s, l), { x: 10 + l, z: 195 + s });
        assert.ok(Math.abs(reader(s, l).heading) < 1e-12);
      }
      assert.equal(view.bandAt(s, l)?.role ?? null, l < 6 ? 'pavement' : null);
    }
  }
  assert.equal(view.address(25, 0).occurrence, traversal.snapshot().occurrences[1], 'seam belongs to successor');
  assert.deepEqual(view.geometry.guideBoundsAt(0), { left: -8, right: 8 });
  const bounds = view.geometry.guideBoundsAt(26);
  assert.ok(Math.abs(bounds.left + 6) < 1e-12 && Math.abs(bounds.right - 18) < 1e-12);
  request.pose.minS = 0;
  request.consumers.contact.behind = 1000;
  assert.equal(view.pose.minS, 25);
  assert.equal(view.coverage[0].start, 0);
  frozen(view);
  assert.deepEqual(Object.keys(view.geometry).sort(), ['guideAt', 'guideBoundsAt', 'length', 'rasterAt']);
});

test('changing the active frame preserves all mapped positions and source addresses', async () => {
  const course = await compile(),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  const forward = ok(traversal.forward(course.links[0]));
  const destination = ok(createCourseGeometryView(traversal.snapshot(), demand(60)));
  ok(traversal.reverse());
  const source = ok(createCourseGeometryView(traversal.snapshot(), demand(200)));
  for (const s of [0, 19.999, 20, 20.001, 40]) {
    close(
      transformPlanarPoint(forward.destinationFromSource, source.geometry.guideAt(s, 1)),
      destination.geometry.guideAt(s, -5),
    );
    const a = source.address(s, 1),
      b = destination.address(s, -5);
    assert.equal(a.occurrence, b.occurrence);
    assert.equal(a.sourceS, b.sourceS);
    assert.ok(Math.abs(a.sourceL - b.sourceL) < 1e-12);
  }
});

test('merge reverse follows each actual predecessor, independent of shared successor and declaration order', async () => {
  for (const count of [2, 3]) {
    const input = forkCourseDocument(fixture(), count);
    input.sections.reverse();
    input.links.reverse();
    const course = await compile(input),
      shared = course.sections.find((s) => !s.outgoing.length);
    for (const branch of course.entry.outgoing) {
      const traversal = createCourseGeometryTraversal(course.entry, 1000);
      ok(traversal.forward(branch));
      const predecessor = traversal.snapshot().active,
        joined = predecessor.section.outgoing[0];
      ok(traversal.forward(joined));
      assert.equal(traversal.snapshot().active.section, shared);
      const view = ok(createCourseGeometryView(traversal.snapshot(), demand(60, 190, 20)));
      assert.equal(view.spans.at(-2).occurrence, predecessor);
      assert.equal(view.address(view.pose.minS - 1, 0).occurrence, predecessor);
      assert.equal(ok(traversal.reverse()).to, predecessor);
      ok(traversal.reverse());
      const state = traversal.snapshot();
      assert.equal(traversal.forward(course.entry.outgoing.find((v) => v !== branch)).ok, false);
      assert.equal(traversal.snapshot().active, state.active);
      assert.equal(traversal.snapshot().occurrences, state.occurrences);
    }
  }
});

test('loop traversal retains only the admitted history while every occurrence shares source readers and assets', async () => {
  const input = fixture(1);
  input.assets = [{ id: 'shared', format: 'superoutride.sprite-lod', version: 1, sha256: '0'.repeat(64) }];
  input.sections[0].assetIds = ['shared'];
  const course = await compile(input),
    link = course.links[0],
    traversal = createCourseGeometryTraversal(course.entry, 40);
  for (let i = 0; i < 1000; i++) {
    ok(traversal.forward(link));
    const state = traversal.snapshot();
    assert.equal(state.occurrences.length, 2);
    assert.equal(state.active.ordinal, i + 1);
    for (const occurrence of state.occurrences) {
      assert.equal(occurrence.section, course.entry);
      assert.equal(occurrence.section.assets[0], course.assets[0]);
    }
  }
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand(100)));
  assert.equal(view.spans.length, 2);
  assert.notEqual(view.spans[0].occurrence, view.spans[1].occurrence);
  assert.equal(view.spans[0].occurrence.section, view.spans[1].occurrence.section);
  for (const s of [0, 19.99999, 20, 20.00001, 40])
    close(view.geometry.guideAt(s, 0), guidePathToWorld(course.entry.guide, 80 + s, 0));
  const last = traversal.snapshot().active;
  ok(traversal.reverse());
  assert.equal(traversal.reverse().ok, false, 'discarded history is not reconstructed from the loop source');
  assert.equal(ok(traversal.forward(link)).to, last);
});

test('loop views cross several visited seams with bounded spans and without accumulating a global world frame', async () => {
  const course = await compile(fixture(1)),
    link = course.links[0];
  const traversal = createCourseGeometryTraversal(course.entry, 2000);
  for (let i = 0; i < 5; i++) ok(traversal.forward(link));
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand(110, 800, 20)));
  assert.equal(view.spans.length, 4);
  assert.equal(new Set(view.spans.map((span) => span.occurrence.section)).size, 1);
  for (let i = 1; i < view.spans.length; i++) {
    const seam = view.spans[i].start;
    close(view.geometry.guideAt(seam - 1e-6, 0), view.geometry.guideAt(seam + 1e-6, 0), 3e-6);
    close(view.geometry.rasterAt(seam - 1e-6, 0), view.geometry.rasterAt(seam + 1e-6, 0), 3e-6);
  }
});

test('each consumer has explicit interval coverage, including the complete pose envelope and step advance', async () => {
  const course = await compile(),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  for (const consumer of ['cameraRender', 'contact', 'driverLookahead', 'reverseRecovery']) {
    const request = demand(170, 10, 10);
    request.consumers[consumer] = { behind: 10, ahead: 21 };
    request.pose.maxS = 175;
    request.pose.maxAdvance = 5;
    const result = createCourseGeometryView(traversal.snapshot(), request);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].path, `/consumers/${consumer}`);
    assert.match(result.diagnostics[0].message, /requires \[160, 201\].*step 5.*\[0, 200\]/);
  }
  const exact = demand(170, 0, 20);
  exact.pose.maxS = 175;
  exact.pose.maxAdvance = 5;
  assert.equal(ok(createCourseGeometryView(traversal.snapshot(), exact)).length, 30);
  const missing = demand(170);
  delete missing.consumers.contact;
  assert.throws(() => createCourseGeometryView(traversal.snapshot(), missing), TypeError);
  assert.equal(
    createCourseGeometryView(traversal.snapshot(), demand(195, 10, 10)).ok,
    false,
    'even a unique successor must be supplied',
  );
  ok(traversal.forward(course.links[0]));
  ok(traversal.reverse());
  assert.equal(createCourseGeometryView(traversal.snapshot(), demand(195, 10, 10)).ok, true);
});

test('retained-history and finite-terminal failures do not clamp queries or substitute another source', async () => {
  const course = await compile(),
    traversal = createCourseGeometryTraversal(course.entry, 0);
  ok(traversal.forward(course.links[0]));
  const history = traversal.snapshot();
  assert.equal(history.occurrences.length, 1);
  const failed = createCourseGeometryView(history, demand(60));
  assert.equal(failed.ok, false);
  assert.match(failed.diagnostics[0].message, /covers \[60, 300\]/);
  assert.equal(createCourseGeometryView(history, demand(295, 5, 10)).ok, false);
  const view = ok(createCourseGeometryView(history, demand(295, 5, 5)));
  assert.equal(view.address(10, 0).sourceS, 300);
  for (const s of [-1, 10.00001, NaN, Infinity]) assert.throws(() => view.geometry.guideAt(s, 0), RangeError);
  assert.throws(() => view.address(1, '0'), TypeError);
  assert.throws(() => createCourseGeometryView({ ...history, active: {} }, demand(100)), RangeError);
});

test('exact mapped activation stations preserve canonical source ownership despite cancellation', async () => {
  const input = fixture(),
    destination = input.sections[1],
    station = 61.23;
  destination.bands.push({
    ...structuredClone(destination.bands[0]),
    id: 'after',
    start: { kind: 'absolute', s: station },
  });
  destination.bands[0].end = { kind: 'absolute', s: station };
  destination.physicalBindings.push({
    bandId: 'after',
    sections: [{ anchor: { kind: 'absolute', s: station }, material: 'ASPHALT' }],
  });
  destination.carriageways[0].bandIds.push('after');
  const course = await compile(input),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  ok(traversal.forward(course.links[0]));
  ok(traversal.reverse());
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand(190, 0, 100)));
  const span = view.spans[1],
    mapped = span.viewAnchorS + (station - span.sourceAnchorS);
  assert.equal(view.address(mapped, 0).sourceS, station);
  assert.equal(view.bandAt(mapped, 0), course.sections[1].bandPartition.bands[1]);
  assert.equal(view.bandAt(mapped - 1e-6, 0), course.sections[1].bandPartition.bands[0]);
});

test('the exact view endpoint at a visited seam uses the successor without a positive-length duplicate', async () => {
  const course = await compile(),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  ok(traversal.forward(course.links[0]));
  ok(traversal.reverse());
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand(180, 0, 20)));
  assert.equal(view.address(view.length, 0).occurrence, traversal.snapshot().occurrences[1]);
  assert.equal(view.spans[1].start, view.spans[1].end);
  close(view.geometry.rasterAt(view.length, 1), { x: 11, z: 220 });
});

test('offline view entry reports explicit transformed itineraries and fails incomplete geometry coverage', () => {
  const run = (...args) =>
    spawnSync(
      process.execPath,
      ['tools/course/compile-course.mjs', 'tests/fixtures/linked-linear.course.json', '--view', ...args],
      { encoding: 'utf8' },
    );
  const success = run('200', '20', '20', '0', 'join');
  assert.equal(success.status, 0, success.stderr);
  const report = JSON.parse(success.stdout);
  assert.equal(report.scope, 'geometry-only');
  assert.equal(report.spans.length, 2);
  assert.equal(report.spans[1].incomingLink, 'join');
  const missing = run('200', '20', '20', '0');
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).diagnostics[0].path, '/consumers/cameraRender');
});

test('fractional lateral edges are classified in the view chart without a lossy inverse boundary round trip', async () => {
  const input = fixture();
  const delta = 0.123;
  input.sections[0].start = { x: 975342, z: -821375, heading: 37 };
  input.sections[1].start = { x: -917326, z: 532811, heading: -123 };
  for (const boundary of input.sections[1].boundaries) for (const knot of boundary.knots) knot.l += delta;
  const course = await compile(input),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  ok(traversal.forward(course.links[0]));
  ok(traversal.reverse());
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand(200)));
  const span = view.spans[1],
    sourceBand = span.occurrence.section.bandPartition.bands[0];
  const right = delta - span.sourceLateralOrigin;
  assert.equal(view.bandAt(21, right - 1e-10), sourceBand);
  assert.equal(view.bandAt(21, right), null);
  assert.equal(view.bandAt(21, right + 1e-10), null);
  const left = -10 + delta - span.sourceLateralOrigin;
  assert.equal(view.bandAt(21, left - 1e-10), null);
  assert.equal(view.bandAt(21, left), sourceBand);
  assert.equal(view.bandAt(21, left + 1e-10), sourceBand);
});

test('unrepresentable classification stations fail before publishing a partial view', async () => {
  const input = fixture(),
    destination = input.sections[1];
  destination.boundaries[0].knots.splice(
    1,
    0,
    ...[61, 61.000000000000014].map((s) => ({ anchor: { kind: 'absolute', s }, l: -10 })),
  );
  const course = await compile(input),
    traversal = createCourseGeometryTraversal(course.entry, 300);
  ok(traversal.forward(course.links[0]));
  const result = createCourseGeometryView(traversal.snapshot(), demand(60, 150, 20));
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].path, '/view');
  assert.match(result.diagnostics[0].message, /stations collapse/);
  assert.equal('value' in result, false);
});

test('a tiny positive visited span cannot silently collapse when mapped between larger neighbors', async () => {
  const input = fixture(),
    middle = input.sections[1],
    terminal = structuredClone(middle);
  terminal.id = 'terminal';
  terminal.start.x += 100;
  middle.ports.push({
    id: 'out',
    kind: 'exit',
    anchor: { kind: 'absolute', s: 60.000000000000014 },
    carriagewayId: 'road',
  });
  input.sections.push(terminal);
  input.links.push({
    id: 'short-span',
    source: { sectionId: middle.id, portId: 'out' },
    destination: { sectionId: terminal.id, portId: 'in' },
    overlap: { behind: 30, ahead: 30 },
  });
  const course = await compile(input),
    traversal = createCourseGeometryTraversal(course.entry, 400);
  ok(traversal.forward(course.links[0]));
  ok(traversal.forward(course.links[1]));
  const result = createCourseGeometryView(traversal.snapshot(), demand(60, 190, 20));
  assert.equal(result.ok, false);
  assert.match(result.diagnostics[0].message, /seam spans must remain representable/);
});
