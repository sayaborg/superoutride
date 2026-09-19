import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePreLockCoverage, compileCourseExitVisibility } from '../../dist/compiler/course-fork-coverage.js';
import { parseCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { courseSectionDrivingDemand } from '../../dist/runtime/course-driving-demand.js';
import { coursePresentationDemand } from '../../dist/runtime/course-presentation-demand.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { createCourseSectionDrivingSource } from '../../dist/runtime/course-section-driving-view.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { RECOVERY_PROFILE } from '../../dist/gameplay/recovery.js';
import { authoredForkDocument } from '../helpers/course-common-presentation.mjs';
import { cameraProfile } from '../helpers/course-driving-probe.mjs';

const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
const compile = async (f) => ok(await compileCourseDocument(f.document, f.inputs));
const anchor = (s) => ({ kind: 'absolute', s });
function inputs(c) {
  const lock = c.entry.fork.lock.s;
  const driving = courseSectionDrivingDemand(
    c.entry.guide,
    { minS: lock - 20, maxS: lock, maxAdvance: 1 },
    cameraProfile,
    { dMax: 200 },
    { ...RECOVERY_PROFILE, lastSafeS: lock },
  );
  const presentation = coursePresentationDemand(
    { behind: 20, ahead: 0, left: 14, right: 14 },
    { behind: 0, ahead: 1, left: 0.1, right: 0.1 },
    cameraProfile,
    { width: 320, dMin: 2.5, dMax: 200 },
    (7 * Math.PI) / 180,
    { chainageRadius: 1, lateralRadius: 0.025 },
    c.sections.map((s) => s.presentation),
  );
  return {
    driving,
    preLock: {
      ...presentation,
      consumers: {
        ...presentation.consumers,
        ...Object.fromEntries(
          ['contact', 'driverLookahead', 'reverseRecovery'].map((name) => [
            name,
            { ...driving.consumers[name], left: 5, right: 5 },
          ]),
        ),
      },
    },
    exit: { ...presentation, pose: { behind: 2, ahead: 2, left: 1, right: 1 } },
  };
}

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

test('pre-lock coverage includes actual projection, driver and recovery ranges without selecting a successor', async () => {
  const c = await compile(await authoredForkDocument()),
    d = inputs(c);
  const receipt = ok(compileCoursePreLockCoverage(c.entry.fork, d.preLock));
  assert.equal(receipt.scope, 'pre-lock-query-domain');
  assert.equal(receipt.commonEnd, 1400);
  assert.equal(receipt.demand.requirements.find((r) => r.consumer === 'driverLookahead').footprint.ahead, 400);
  const traversal = createCourseGeometryTraversal(c.entry, {
    retainBehind: 1000,
    selectAhead: 1000,
    maxOccurrences: 4,
  });
  const view = ok(createCourseGeometryView(traversal.snapshot(), d.driving));
  const driving = ok(createCourseSectionDrivingSource(c.entry).createView(view));
  assert.ok(receipt.geometry.interval.sStart <= driving.range.start);
  assert.ok(receipt.geometry.interval.sEnd >= driving.range.end);
  let queries = 0;
  const world = {
    ...driving.world,
    surfaces: {
      ...driving.world.surfaces,
      sample(s, l) {
        queries++;
        const bounds = receipt.demand.requirements.find((r) => r.consumer === 'contact').bounds;
        assert.ok(s >= 200 - bounds.behind && s <= 200 + bounds.ahead && l >= -bounds.left && l <= bounds.right);
        return driving.world.surfaces.sample(s, l);
      },
    },
  };
  for (const entry of VEHICLE_CATALOG)
    for (const l of [-14, 0, 14]) {
      const vehicle = createArcadeVehicle(entry.profile, world, {
        s: 195,
        l,
        initialSpeed: 15,
        torqueProtection: entry.torqueProtection,
      });
      for (let i = 0; i < 4; i++) {
        const input = sampleRivalDrivingInput(world.guide, vehicle, l);
        updateArcadeVehicle(world, vehicle, input, 1 / 60);
        assert.ok(vehicle.course.s >= 180 && vehicle.course.s <= 201);
      }
    }
  assert.ok(queries > 100);
  assert.equal(traversal.snapshot().selected.length, 0);
  assert.equal(traversal.snapshot().occurrences.length, 1);
});

test('each missing pre-lock range identifies its consumer; later selection cannot excuse it', async () => {
  const c = await compile(await authoredForkDocument());
  for (const consumer of ['cameraRender', 'groundFilter', 'scenery', 'contact', 'driverLookahead', 'reverseRecovery']) {
    const d = inputs(c).preLock;
    d.consumers[consumer] = { ...d.consumers[consumer], ahead: 1200 };
    const r = compileCoursePreLockCoverage(c.entry.fork, d);
    assert.equal(r.ok, false);
    assert.deepEqual(
      r.diagnostics.map((i) => [i.kind, i.code, i.consumer]),
      [['fork-qualification', 'coverage_gap', consumer]],
    );
  }
  const d = inputs(c).preLock;
  d.pose = { ...d.pose, ahead: 1 };
  assert.equal(compileCoursePreLockCoverage(c.entry.fork, d).ok, false);
  assert.throws(() => compileCoursePreLockCoverage({ ...c.entry.fork }, inputs(c).preLock), RangeError);
  const zero = { behind: 0, ahead: 0, left: 1, right: 1 };
  const point = {
    pose: zero,
    step: zero,
    consumers: Object.fromEntries(Object.keys(d.consumers).map((key) => [key, zero])),
  };
  const rejected = compileCoursePreLockCoverage(c.entry.fork, point);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostics[0].code, 'invalid_numeric_domain');
});

test('the earliest of staggered exit seams bounds unresolved pre-lock lookahead', async () => {
  const f = await authoredForkDocument(),
    parent = f.document.sections[0];
  parent.fork.closure = anchor(450);
  parent.ports[0].anchor = anchor(550);
  f.document.links.find((l) => l.source.sectionId === parent.id && l.source.portId === parent.ports[0].id).overlap = {
    behind: 30,
    ahead: 30,
  };
  const c = await compile(f),
    result = compileCoursePreLockCoverage(c.entry.fork, inputs(c).preLock);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((i) => i.consumer === 'driverLookahead' && i.message.includes('550')));
});

test('all exits and shared-successor incoming Links derive conservative clear approach intervals', async () => {
  const c = await compile(await authoredForkDocument()),
    d = inputs(c).exit;
  const q = ok(compileCourseExitVisibility(c.links, d));
  assert.equal(q.scope, 'exit-presentation-domain');
  assert.equal(q.exits.length, 6);
  for (const [i, exit] of q.exits.entries()) {
    assert.equal(exit.link, c.links[i]);
    assert.ok(Object.isFrozen(exit));
    assert.equal(exit.parentSpecificVisibleEndUpperBound, 906);
    assert.equal(exit.clearThrough, 1703);
    assert.ok(
      exit.parentSpecificVisibleEndUpperBound <= exit.link.source.anchor.s &&
        exit.clearThrough >= exit.link.source.anchor.s,
    );
  }
  const expanded = structuredClone(d);
  expanded.consumers.scenery.behind = 500;
  assert.equal(compileCourseExitVisibility(c.links, expanded).ok, false);
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

test('file-backed compiler reports authored forks, pre-lock requirements and every exit clear interval', async () => {
  const f = await authoredForkDocument(),
    c = await compile(f),
    d = inputs(c);
  const directory = await mkdtemp(path.join(tmpdir(), 'superoutride-fork-'));
  try {
    const document = path.join(directory, 'course.json'),
      pre = path.join(directory, 'pre.json'),
      exit = path.join(directory, 'exit.json');
    await writeFile(document, JSON.stringify(f.document));
    await writeFile(pre, JSON.stringify(d.preLock));
    await writeFile(exit, JSON.stringify(d.exit));
    for (const input of f.inputs) await writeFile(path.join(directory, `${input.sha256}.json`), input.bytes);
    const run = (...args) => {
      const result = spawnSync(
        process.execPath,
        ['tools/course/compile-course.mjs', document, '--images', directory, ...args],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    assert.deepEqual(
      run().sections[0].fork.regions.map((r) => [r.left, r.right]),
      [
        [-18, -7],
        [-7, 7],
        [7, 18],
      ],
    );
    const report = run('--pre-lock', c.entry.id, pre);
    assert.equal(report.scope, 'pre-lock-query-domain');
    assert.equal(report.ranges.length, 6);
    assert.equal(run('--exit-visibility', exit).exits.length, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
