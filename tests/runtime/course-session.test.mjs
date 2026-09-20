import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.mjs';
import { runCourseReference } from '../../tools/course/reference-run.mjs';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readCourseReference } from '../../dist/runtime/course-reference.js';
import { resolveCourseSession } from '../../dist/runtime/course-session.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createRecoveryState } from '../../dist/gameplay/recovery.js';
import { createCameraRig } from '../../dist/camera/camera.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';

const file = new URL('../../content/courses/linear.course.json', import.meta.url).pathname;
const loaded = await loadCourse(file),
  { course } = loaded;
const reference = JSON.parse(await readFile(new URL('../../content/reference/linear.json', import.meta.url)));
const ground = await loadCourseGround(course, file);
const settings = { mode: 'CUSTOM', rivalCount: 0, lapCount: 1, countdown: true };

test('authored Session gates and grid resolve canonical references, supported width and ordered anchors', async () => {
  const interval = course.rules.intervals[0],
    checkpoint = interval.checkpoints[0];
  assert.equal(interval.section === course.entry, true);
  assert.equal(checkpoint.section === course.entry, true);
  assert.equal(course.entry.carriageways.includes(checkpoint.carriageway), true);
  assert.ok(Object.isFrozen(course.rules.grid) && Object.isFrozen(checkpoint));
  for (const mutate of [
    (d) => {
      d.rules.grid[0].l = 999;
    },
    (d) => {
      d.rules.checkpoints[0].anchor = d.rules.finishes[0].anchor;
    },
    (d) => {
      d.rules.finishes = [];
    },
    (d) => {
      d.rules.maxLaps = 2;
    },
    (d) => {
      d.rules.classic.lapCount = 2;
    },
  ]) {
    const source = structuredClone(loaded.document);
    mutate(source);
    const rejected = await compileCourseDocument(source, loaded.images);
    assert.equal(rejected.ok, false);
    assert.ok(rejected.diagnostics.some((d) => d.code === 'invalid_rules'));
  }
  const changed = structuredClone(loaded.document);
  changed.rules.checkpoints[0].anchor = {
    kind: 'primitive',
    primitiveId: course.entry.primitives[1].source.id,
    fraction: 0.5,
  };
  const compiled = await compileCourseDocument(changed, loaded.images);
  assert.equal(compiled.ok, true);
  assert.equal(
    compiled.value.rules.intervals[0].checkpoints[0].anchor.primitive === compiled.value.entry.primitives[1],
    true,
  );
});

test('reference admission rejects stale identities, reordered gates, incomplete coverage and recovered runs', async () => {
  const vehicle = browserSessionVehicle(VEHICLE_CATALOG[0]);
  const budgets = await readCourseReference(course, vehicle, reference);
  assert.ok(budgets.initialMs > 0);
  for (const mutate of [
    (r) => {
      r.courseBuildSha256 = '0'.repeat(64);
    },
    (r) => {
      r.driver.utilization = 0.1;
    },
    (r) => {
      r.vehicles[0].vehicleSha256 = '0'.repeat(64);
    },
    (r) => {
      r.vehicles[0].runs[0].events.reverse();
    },
    (r) => {
      r.vehicles[0].runs[0].events.pop();
    },
    (r) => {
      r.vehicles[0].runs[0].metrics.recoveries = 1;
    },
    (r) => {
      r.vehicles[0].runs = [];
    },
  ]) {
    const value = structuredClone(reference);
    mutate(value);
    await assert.rejects(readCourseReference(course, vehicle, value));
  }
  assert.throws(() => resolveCourseSession(course, settings, vehicle), /requires current/);
  const session = resolveCourseSession(course, { ...settings, rivalCount: 16 }, vehicle, budgets);
  assert.equal(session.course, course);
  assert.equal(session.grid, course.rules.grid);
  assert.equal(session.vehicle, vehicle);
  assert.equal(session.configuration.rivalCount, 16);
  const mutable = structuredClone(reference);
  const pending = readCourseReference(course, vehicle, mutable);
  mutable.vehicles[0].runs[0].events[0].timeSeconds = Infinity;
  assert.equal((await pending).initialMs, budgets.initialMs, 'admission owns input before awaiting its digest');
});

test('branch budgets take the maximum next interval over continuous histories sharing a landmark', async () => {
  const { course: branch } = await loadCourse(
    new URL('../../content/courses/branch.course.json', import.meta.url).pathname,
  );
  const saved = JSON.parse(await readFile(new URL('../../content/reference/branch.json', import.meta.url)));
  const budgets = await readCourseReference(branch, browserSessionVehicle(VEHICLE_CATALOG[0]), saved);
  const runs = saved.vehicles[0].runs;
  const ms = (seconds) => Math.ceil(1000 * branch.rules.classic.timeMargin * seconds);
  assert.equal(budgets.initialMs, ms(Math.max(...runs.map((r) => r.events[0].intervalSeconds))));
  for (const interval of branch.rules.intervals)
    for (const gate of interval.checkpoints) {
      const following = runs.flatMap((r) =>
        r.events.flatMap((event, i) => (event.landmarkId === gate.id ? [r.events[i + 1].intervalSeconds] : [])),
      );
      assert.equal(budgets.after(gate, 1), ms(Math.max(...following)));
    }
});

test('expired physical crossing cannot award progress or checkpoint time', () => {
  const vehicle = browserSessionVehicle(VEHICLE_CATALOG[0]);
  const budgets = { initialMs: 1, after: () => 1000 };
  const session = resolveCourseSession(course, settings, vehicle, budgets),
    scene = createCourseScene(course.entry, ground);
  const first = course.rules.intervals[0].checkpoints[0];
  const car = createArcadeVehicle(vehicle.profile, scene.world, {
    ...vehicle,
    s: first.anchor.s - 0.5,
    l: 0,
    initialSpeed: 60,
  });
  const actor = { vehicle: car, recovery: createRecoveryState(car), cameraRig: createCameraRig() };
  const race = createCourseRace({
    session,
    player: actor,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: vehicle,
  });
  race.start();
  race.advance({ steering: 0, throttle: false, brake: false }, 1 / 60);
  assert.equal(race.clock.status, 'GAME_OVER');
  assert.equal(race.clock.elapsedSeconds, 0.001);
  assert.equal(race.player.progress.validatedProgressFloor, 0);
  assert.equal(race.events.length, 0);
  const before = { x: car.x, z: car.z, time: race.clock.elapsedSeconds };
  race.advance({ steering: 1, throttle: true, brake: false }, 1 / 60);
  assert.deepEqual({ x: car.x, z: car.z, time: race.clock.elapsedSeconds }, before);
});

for (const index of [0, 5])
  test(`continuous ${VEHICLE_CATALOG[index].profile.id} replay reproduces saved accepted times with production inputs`, () => {
    const entry = VEHICLE_CATALOG[index],
      saved = reference.vehicles.find((v) => v.vehicleId === entry.profile.id);
    const run = runCourseReference(course, ground, entry, saved.envelope, [], 1);
    assert.deepEqual(run.events, saved.runs[0].events);
    assert.equal(run.elapsedSeconds, saved.runs[0].elapsedSeconds);
    assert.equal(run.metrics.recoveries, 0);
    assert.ok(run.metrics.maximumSpeed > saved.envelope.maximumSpeed * 0.9);
  });
