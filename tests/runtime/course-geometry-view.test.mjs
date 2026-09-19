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
import { imageInput } from '../helpers/course-image-input.mjs';

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
const createTraversal = (entry, retainBehind) =>
  createCourseGeometryTraversal(entry, { retainBehind, selectAhead: 10000, maxOccurrences: 1024 });
const advance = (traversal, link) => {
  const selected = traversal.select(traversal.snapshot().active, link);
  return selected.ok ? traversal.forward() : selected;
};

function frozen(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  assert.ok(Object.isFrozen(value));
  assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
  Object.values(value).forEach((child) => frozen(child, visited));
}

test('occurrences retain canonical visited Links, separate source reuse from identity and reverse the actual frame', async () => {
  const course = await compile();
  const traversal = createTraversal(course.entry, 300);
  const before = traversal.snapshot(),
    forward = ok(advance(traversal, course.links[0]));
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
    ok(advance(traversal, course.links[0])).to,
    forward.to,
    're-entry retains the recorded occurrence identity',
  );
  frozen(traversal.snapshot());
  assert.equal(course.entry.outgoing[0], course.links[0]);
});

test('selection exposes an adjacent occurrence without changing the active frame or inventing a visit', async () => {
  const course = await compile(),
    traversal = createTraversal(course.entry, 300),
    initial = traversal.snapshot();
  assert.equal(traversal.forward().reason, 'selection_required');
  const candidate = ok(traversal.select(initial.active, course.links[0]));
  const selected = traversal.snapshot();
  assert.equal(selected.active, initial.active);
  assert.equal(selected.occurrences, initial.occurrences);
  assert.deepEqual(selected.selected, [candidate]);
  assert.equal(ok(traversal.select(initial.active, course.links[0])), candidate);
  assert.equal(traversal.reverse().reason, 'history_exhausted');
  const view = ok(createCourseGeometryView(selected, demand(200)));
  assert.equal(view.frame, initial.active);
  assert.equal(view.address(20, 0).occurrence, candidate);
  assert.equal(selected.occurrences.includes(candidate), false);
  const advanced = ok(traversal.forward());
  assert.equal(advanced.to, candidate);
  assert.equal(traversal.snapshot().active, candidate);
  assert.deepEqual(traversal.snapshot().selected, []);
  assert.deepEqual(traversal.snapshot().occurrences, [initial.active, candidate]);
  frozen(selected);
  frozen(traversal.snapshot());
});

test('preselected fork and merge preserve actual predecessors only when each occurrence is visited', async () => {
  const course = await compile(forkCourseDocument(fixture(), 3));
  for (const link of course.entry.outgoing) {
    const traversal = createTraversal(course.entry, 1000),
      initial = traversal.snapshot().active;
    const child = ok(traversal.select(initial, link));
    const merge = child.section.outgoing[0],
      shared = ok(traversal.select(child, merge));
    assert.equal(traversal.snapshot().occurrences.length, 1);
    assert.deepEqual(traversal.snapshot().selected, [child, shared]);
    assert.equal(
      traversal.select(
        initial,
        course.entry.outgoing.find((v) => v !== link),
      ).reason,
      'selection_locked',
    );
    assert.equal(ok(traversal.forward()).to, child);
    assert.equal(ok(traversal.forward()).to, shared);
    assert.equal(traversal.snapshot().active.incoming, merge);
    assert.equal(ok(traversal.reverse()).to, child);
    assert.equal(ok(traversal.reverse()).to, initial);
    assert.equal(ok(traversal.forward()).to, child);
  }
});

test('reversing retains pending identity without turning it into visited future history', async () => {
  const course = await compile(fixture(1)),
    link = course.links[0],
    traversal = createTraversal(course.entry, 1000);
  const initial = traversal.snapshot().active;
  const first = ok(advance(traversal, link)).to;
  const second = ok(traversal.select(first, link));
  const pending = traversal.snapshot().selected;
  ok(traversal.reverse());
  assert.equal(traversal.snapshot().active, initial);
  assert.equal(traversal.snapshot().selected, pending);
  assert.equal(traversal.snapshot().occurrences.includes(second), false);
  assert.equal(ok(traversal.forward()).to, first);
  assert.equal(traversal.snapshot().selected, pending);
  assert.equal(ok(traversal.forward()).to, second);
});

test('future selection has explicit distance and count bounds, with no silent partial itinerary', async () => {
  const course = await compile(fixture(1)),
    link = course.links[0];
  const span = link.source.anchor.s - link.destination.anchor.s;
  const limits = { retainBehind: 1000, selectAhead: span, maxOccurrences: 10 };
  const traversal = createCourseGeometryTraversal(course.entry, limits);
  limits.selectAhead = Infinity;
  limits.maxOccurrences = 10000;
  const first = ok(traversal.select(traversal.snapshot().active, link));
  const second = ok(traversal.select(first, link)),
    before = traversal.snapshot();
  assert.equal(traversal.select(second, link).reason, 'selection_limit');
  assert.equal(traversal.snapshot().selected, before.selected);
  assert.equal(traversal.snapshot().occurrences, before.occurrences);
  const capped = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: span, maxOccurrences: 2 });
  const next = ok(capped.select(capped.snapshot().active, link));
  assert.equal(capped.select(next, link).reason, 'occurrence_limit');
  for (const value of [-1, NaN, Infinity])
    assert.throws(
      () => createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: value, maxOccurrences: 2 }),
      RangeError,
    );
  for (const value of [0, 1, 2.5, Infinity])
    assert.throws(
      () => createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: value }),
      RangeError,
    );
});

test('thousands of select/advance operations allocate only bounded instances over one loop source', async () => {
  const course = await compile(fixture(1)),
    link = course.links[0];
  const traversal = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  for (let i = 0; i < 2000; i += 1) {
    const before = traversal.snapshot();
    const candidate = ok(traversal.select(before.active, link));
    assert.equal(traversal.snapshot().occurrences, before.occurrences);
    assert.equal(traversal.snapshot().selected.length, 1);
    assert.equal(candidate.section, course.entry);
    assert.equal(candidate.section.raster, course.entry.raster);
    assert.equal(candidate.section.assets, course.entry.assets);
    assert.equal(ok(traversal.forward()).to, candidate);
    assert.equal(traversal.snapshot().occurrences.length, 1);
    assert.equal(traversal.snapshot().selected.length, 0);
  }
  assert.equal(traversal.snapshot().active.ordinal, 2000);
  assert.equal(traversal.reverse().reason, 'history_exhausted');
});

test('failed traversal leaves state intact and never accepts an ID-equivalent Link from another compilation', async () => {
  const a = await compile(),
    b = await compile();
  const traversal = createTraversal(a.entry, 100);
  const initial = traversal.snapshot();
  assert.throws(() => advance(traversal, b.links[0]), RangeError);
  assert.equal(traversal.reverse().ok, false);
  assert.equal(traversal.snapshot().active, initial.active);
  assert.equal(traversal.snapshot().occurrences, initial.occurrences);
  assert.throws(() => createTraversal(a.entry, '100'), TypeError);
  for (const value of [-1, Infinity, NaN]) assert.throws(() => createTraversal(a.entry, value), RangeError);
});

test('a transformed view shares one source address for narrow Raster/Guide readers and Band classification', async () => {
  const course = await compile(),
    traversal = createTraversal(course.entry, 300);
  ok(traversal.select(traversal.snapshot().active, course.links[0]));
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
  assert.equal(view.address(25, 0).occurrence, traversal.snapshot().selected[0], 'seam belongs to selected successor');
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
    traversal = createTraversal(course.entry, 300);
  const forward = ok(advance(traversal, course.links[0]));
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
      const traversal = createTraversal(course.entry, 1000);
      ok(advance(traversal, branch));
      const predecessor = traversal.snapshot().active,
        joined = predecessor.section.outgoing[0];
      ok(advance(traversal, joined));
      assert.equal(traversal.snapshot().active.section, shared);
      const view = ok(createCourseGeometryView(traversal.snapshot(), demand(60, 190, 20)));
      assert.equal(view.spans.at(-2).occurrence, predecessor);
      assert.equal(view.address(view.pose.minS - 1, 0).occurrence, predecessor);
      assert.equal(ok(traversal.reverse()).to, predecessor);
      ok(traversal.reverse());
      const state = traversal.snapshot();
      assert.equal(
        advance(
          traversal,
          course.entry.outgoing.find((v) => v !== branch),
        ).ok,
        false,
      );
      assert.equal(traversal.snapshot().active, state.active);
      assert.equal(traversal.snapshot().occurrences, state.occurrences);
    }
  }
});

test('loop traversal retains only the admitted history while every occurrence shares source readers and assets', async () => {
  const input = fixture(1);
  const image = imageInput('shared');
  input.assets = [image.reference];
  input.sections[0].assetIds = ['shared'];
  const course = ok(await compileCourseDocument(input, [image.input])),
    link = course.links[0],
    traversal = createTraversal(course.entry, 40);
  for (let i = 0; i < 1000; i++) {
    ok(advance(traversal, link));
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
  assert.equal(ok(advance(traversal, link)).to, last);
});

test('loop views cross several visited seams with bounded spans and without accumulating a global world frame', async () => {
  const course = await compile(fixture(1)),
    link = course.links[0];
  const traversal = createTraversal(course.entry, 2000);
  for (let i = 0; i < 5; i++) ok(advance(traversal, link));
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
    traversal = createTraversal(course.entry, 300);
  for (const consumer of ['cameraRender', 'contact', 'driverLookahead', 'reverseRecovery']) {
    const request = demand(170, 10, 10);
    request.consumers[consumer] = { behind: 10, ahead: 21 };
    request.pose.maxS = 175;
    request.pose.maxAdvance = 5;
    const result = createCourseGeometryView(traversal.snapshot(), request);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'coverage_gap');
    assert.equal(result.consumer, consumer);
    assert.deepEqual(result.required, { start: 160, end: 201 });
    assert.deepEqual(result.available, { start: 0, end: 200 });
    assert.match(result.message, /requires \[160, 201\].*step 5.*\[0, 200\]/);
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
  ok(traversal.select(traversal.snapshot().active, course.links[0]));
  assert.equal(createCourseGeometryView(traversal.snapshot(), demand(195, 10, 10)).ok, true);
});

test('retained-history and finite-terminal failures do not clamp queries or substitute another source', async () => {
  const course = await compile(),
    traversal = createTraversal(course.entry, 0);
  ok(advance(traversal, course.links[0]));
  const history = traversal.snapshot();
  assert.equal(history.occurrences.length, 1);
  const failed = createCourseGeometryView(history, demand(60));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /covers \[60, 300\]/);
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
    traversal = createTraversal(course.entry, 300);
  ok(advance(traversal, course.links[0]));
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
    traversal = createTraversal(course.entry, 300);
  ok(advance(traversal, course.links[0]));
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
  assert.equal(report.visitedOccurrences, 1);
  assert.equal(report.selectedOccurrences, 1);
  const missing = run('200', '20', '20', '0');
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).reason, 'coverage_gap');
  assert.equal(JSON.parse(missing.stderr).consumer, 'cameraRender');
});

test('fractional lateral edges are classified in the view chart without a lossy inverse boundary round trip', async () => {
  const input = fixture();
  const delta = 0.123;
  input.sections[0].start = { x: 975342, z: -821375, heading: 37 };
  input.sections[1].start = { x: -917326, z: 532811, heading: -123 };
  for (const boundary of input.sections[1].boundaries) for (const knot of boundary.knots) knot.l += delta;
  const course = await compile(input),
    traversal = createTraversal(course.entry, 300);
  ok(advance(traversal, course.links[0]));
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
    traversal = createTraversal(course.entry, 300);
  ok(advance(traversal, course.links[0]));
  const result = createCourseGeometryView(traversal.snapshot(), demand(60, 150, 20));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unrepresentable_view');
  assert.match(result.message, /stations collapse/);
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
    traversal = createTraversal(course.entry, 400);
  ok(advance(traversal, course.links[0]));
  ok(advance(traversal, course.links[1]));
  const result = createCourseGeometryView(traversal.snapshot(), demand(60, 190, 20));
  assert.equal(result.ok, false);
  assert.match(result.message, /seam spans must remain representable/);
});

test('prepared traversal views publish only after successful admission and discard stale candidates', async () => {
  const c = await compile(),
    traversal = createTraversal(c.entry, 300);
  const first = traversal.snapshot();
  assert.equal(traversal.snapshot(), first);
  assert.equal(traversal.prepare('forward').reason, 'selection_required');
  const successor = ok(traversal.select(first.active, c.links[0]));
  const before = traversal.snapshot(),
    prepared = ok(traversal.prepare('forward'));
  assert.equal(traversal.snapshot(), before, 'preparation must not visit the selected occurrence');
  assert.equal(prepared.history.active, successor);
  const missing = createCourseGeometryView(prepared.history, demand(50, 1000, 1000));
  assert.equal(missing.ok, false);
  assert.equal(traversal.snapshot(), before, 'failed consumer admission preserves the active frame/history');
  const destination = ok(createCourseGeometryView(prepared.history, demand(60)));
  assert.equal(destination.frame, successor);
  frozen(prepared.history);
  assert.equal(ok(prepared.commit()).to, successor);
  assert.equal(traversal.snapshot(), prepared.history);
  assert.equal(prepared.commit().reason, 'stale_transition');
  const reverse = ok(traversal.prepare('reverse'));
  assert.equal(reverse.history.active, first.active);
  assert.equal(traversal.snapshot(), prepared.history);
  ok(traversal.reverse());
  assert.equal(reverse.commit().reason, 'stale_transition');
  assert.equal(traversal.snapshot().active, first.active);
  assert.throws(() => traversal.prepare(null), TypeError);
  assert.throws(() => traversal.prepare('sideways'), RangeError);
});

test('selection changes invalidate pending movement without replacing source or occurrence identity', async () => {
  const c = await compile(forkCourseDocument(fixture(), 3)),
    traversal = createTraversal(c.entry, 300);
  const child = ok(traversal.select(traversal.snapshot().active, c.entry.outgoing[2]));
  const prepared = ok(traversal.prepare('forward'));
  ok(traversal.select(child, child.section.outgoing[0]));
  const before = traversal.snapshot();
  assert.equal(prepared.commit().reason, 'stale_transition');
  assert.equal(traversal.snapshot(), before);
  assert.equal(before.selected[0], child);
  const current = ok(traversal.prepare('forward'));
  assert.equal(
    ok(traversal.select(before.active, child.incoming)),
    child,
    'idempotent selection preserves preparation',
  );
  ok(current.commit());
  const merge = ok(traversal.prepare('forward'));
  ok(merge.commit());
  const reverse = ok(traversal.prepare('reverse'));
  assert.equal(reverse.to, child, 'shared successor retains the selected actual predecessor');
});
