import { createTestSpriteAssets } from '../helpers/sprite-assets.mjs';
import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import { resolveCourseSession } from '../../dist/runtime/course-session.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { testGround } from '../helpers/resident-ground.mjs';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readCourseImages } from '../../tools/course/read-course-images.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { createCourseForkField } from '../../dist/runtime/course-fork-field.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import {
  createRecoveryState,
  recoverVehicleToGuideCoordinate,
  advanceVehicleWithRecovery,
} from '../../dist/gameplay/recovery.js';
import { driveMeasuredVehicle, testEnvelope } from '../helpers/envelope-driving.mjs';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
const document = JSON.parse(await readFile(new URL('../../content/courses/branch.course.json', import.meta.url)));
const result = await compileCourseDocument(
  document,
  await readCourseImages(document.assets, new URL('../../content/images/', import.meta.url).pathname),
);
assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
const course = result.value,
  fork = course.entry.fork;
const ground = await testGround(course, 'branch');
const point = (s, l) => guidePathToWorld(course.entry.guide, s, l, createPlanarCoordinateSample());
function fixture(entry = VEHICLE_CATALOG[0], rivalCount = 1) {
  const scene = createCourseScene(course.entry, ground, createTestSpriteAssets());
  const vehicle = createArcadeVehicle(entry.profile, scene.world, {
    ...browserSessionVehicle(entry),
    s: 45,
    l: 0,
    initialSpeed: 0,
    torqueProtection: entry.torqueProtection,
  });
  const actor = { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() };
  const rival = VEHICLE_CATALOG[0];
  const race = createCourseRace({
    sprites: createTestSpriteAssets(),
    session: resolveCourseSession(
      course,
      { mode: 'CUSTOM', rivalCount, lapCount: 1, countdown: false },
      browserSessionVehicle(entry),
    ),
    player: actor,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: browserSessionVehicle(rival),
    rivalEnvelope: testEnvelope(rival.profile.id),
  });
  race.start();
  return { scene, actor, race };
}
test('all eligible world crossings choose once by u then stable ID, including the half-open median and zero rivals', () => {
  for (const [motions, expected] of [
    [
      [
        ['b', 249.2, 250.2, -5],
        ['a', 249.7, 250.7, 5],
      ],
      1,
    ],
    [
      [
        ['b', 249, 251, 5],
        ['a', 249, 251, -5],
      ],
      0,
    ],
    [[['PLAYER', 249, 251, 0]], 1],
    [[['PLAYER', 249, 251, 131]], null],
    [[['PLAYER', 251, 249, 5]], null],
  ]) {
    const scene = createCourseScene(course.entry, ground, createTestSpriteAssets()),
      field = createCourseForkField(course.sections);
    const entries = motions.map(([id, start, end, l]) => ({
      id,
      session: scene.createActorSession(),
      previous: point(start, l),
      current: point(end, l),
      recovered: false,
    }));
    field.observe(entries);
    assert.equal(field.choice(fork), expected === null ? null : fork.regions[expected].link);
    if (expected !== null) {
      for (const m of entries) assert.equal(m.session.history.selected[0].incoming, fork.regions[expected].link);
      field.observe(
        entries.map((m) => ({ ...m, previous: point(249, expected ? -5 : 5), current: point(251, expected ? -5 : 5) })),
      );
      assert.equal(field.choice(fork), fork.regions[expected].link);
    }
  }
  const { scene } = fixture();
  const field = createCourseForkField(course.sections);
  field.observe([
    { id: 'PLAYER', session: scene.session, previous: point(249, -5), current: point(251, -5), recovered: true },
  ]);
  assert.equal(field.choice(fork), null);
});
test('closure uses ordinary recovery and canonical state-selected signs without awarding progress', () => {
  const { scene, actor, race } = fixture(undefined, 0);
  const before = [race.player.progress.sProgress, race.player.progress.validatedProgressFloor];
  assert.equal(scene.session.closedCarriageways.length, 0);
  race.forks.observe([
    { id: 'PLAYER', session: scene.session, previous: point(249, -5), current: point(251, -5), recovered: false },
  ]);
  assert.deepEqual(scene.session.closedCarriageways, [fork.regions[1].link.source.carriageway]);
  const signs = scene.session.view.presentation.conditionalSprites.filter((s) =>
    scene.session.closedCarriageways.includes(s.unselected),
  );
  assert.equal(signs.length, 2);
  assert.ok(signs.every((s) => s.sprite.name.startsWith('right-')));
  recoverVehicleToGuideCoordinate(scene.world, actor.vehicle, {
    state: actor.recovery,
    reason: 'manual',
    target: { s: 650, l: 5.5 },
  });
  race.resyncPlayer();
  assert.equal(actor.recovery.lastReason, 'wrong-course');
  assert.ok(Math.abs(actor.vehicle.course.l + 5.5) < 1e-8);
  assert.deepEqual([race.player.progress.sProgress, race.player.progress.validatedProgressFloor], before);
  race.advance({ steering: 0, throttle: false, brake: false }, 1 / 120);
  assert.equal(race.player.progress.validatedProgressFloor, before[1]);
  assert.ok(race.player.progress.sProgress < before[0] + 1);
  assert.equal(race.forks.targetL(course.entry, 700, 2), race.forks.targetL(course.entry, 700, -2));
});
for (const [entry, side, rivalCount] of [
  [VEHICLE_CATALOG[0], -2, 1],
  [VEHICLE_CATALOG[5], 2, 2],
])
  test(`saved BRANCH ${entry.profile.id} physically locks, crosses the median, commits its exit and reuses the merge`, () => {
    const { scene, actor, race } = fixture(entry, rivalCount);
    const target = new SoftwareSurface(320, 240);
    let seenPath = null,
      seenMerge = false,
      seenLocked = false;
    for (let tick = 0; tick < 6000; tick++) {
      race.advance(
        driveMeasuredVehicle(scene.world.guide, actor.vehicle, (s) =>
          race.forks.targetL(scene.history.active.section, s, side),
        ),
        1 / 60,
      );
      const selected = race.forks.choice(fork);
      seenLocked ||= selected !== null;
      if (scene.history.active.ordinal === 1) seenPath = scene.history.active.section;
      if (scene.history.active.ordinal === 2) seenMerge = true;
      if (tick % 1200 === 0) {
        const camera = updateCamera(actor.cameraRig, scene.world, actor.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
        const observed = race.observe(camera);
        assert.ok(
          scene.render(
            target,
            actor.vehicle,
            camera,
            entry.profile.id === 'TESTAROSSA' ? 'car' : 'bike',
            observed.sprites,
          ).terrainOutputPixels > 1000,
        );
      }
      if (race.clock.status === 'GOAL') break;
    }
    assert.equal(seenLocked, true);
    assert.equal(seenMerge, true);
    const selected = race.forks.choice(fork);
    assert.equal(selected === fork.regions[side < 0 ? 0 : 1].link, true);
    assert.equal(seenPath === selected.destination.section, true);
    assert.equal(scene.history.active.section, selected.destination.section.outgoing[0].destination.section);
    for (const c of [race.player, ...race.rivals]) {
      assert.ok(c.progress.sProgress > 0);
      if (c === race.player) assert.equal(c.progress.status, 'FINISHED');
      assert.equal(c.actor.recovery.recoveries, 0);
      assert.equal(c.session.history.active.section, scene.history.active.section);
      assert.ok(c.session.history.occurrences.length + c.session.history.selected.length <= 4);
    }
    assert.ok(race.label().startsWith('GOAL'));
    const earned = [
      race.player.progress.sProgress,
      race.player.progress.validatedProgressFloor,
      race.player.finishElapsedSeconds,
    ];
    actor.vehicle = createArcadeVehicle(entry.profile, scene.world, {
      s: 101,
      l: 0,
      initialSpeed: -12,
      torqueProtection: entry.torqueProtection,
    });
    actor.recovery = createRecoveryState(actor.vehicle);
    race.resyncPlayer();
    for (let tick = 0; tick < 30; tick++) {
      const previous = { x: actor.vehicle.x, z: actor.vehicle.z };
      advanceVehicleWithRecovery(scene.world, actor.vehicle, {
        state: actor.recovery,
        input: { steering: 0, throttle: false, brake: false },
        dt: 1 / 60,
      });
      scene.observeStep(actor, previous, false);
      race.resyncPlayer();
    }
    assert.equal(
      scene.history.active.section === seenPath,
      true,
      'reverse uses the actual chosen predecessor of the shared merge',
    );
    assert.deepEqual(
      [race.player.progress.sProgress, race.player.progress.validatedProgressFloor, race.player.finishElapsedSeconds],
      earned,
    );
  });

test('every fork exit and merge seam keeps a 30 m guard and clears parent-specific pixels in the ordinary camera', () => {
  const entry = VEHICLE_CATALOG[0];
  for (const link of course.links)
    for (const offset of [-1, 1]) {
      const scene = createCourseScene(link.source.section, ground, createTestSpriteAssets());
      if (link.source.section.fork) scene.session.prepareChoice(link).commit();
      const lateral =
        link.source.carriageway.bands
          .filter((b) => b.start.s <= link.source.anchor.s && b.end.s >= link.source.anchor.s)
          .reduce(
            (range, b) => [
              Math.min(range[0], courseBoundaryAt(b.left, link.source.anchor.s)),
              Math.max(range[1], courseBoundaryAt(b.right, link.source.anchor.s)),
            ],
            [Infinity, -Infinity],
          )
          .reduce((a, b) => a + b, 0) / 2;
      const vehicle = createArcadeVehicle(entry.profile, scene.world, {
        ...browserSessionVehicle(entry),
        s: link.source.anchor.s - 0.4,
        l: lateral + offset,
        initialSpeed: 30,
        torqueProtection: entry.torqueProtection,
      });
      const actor = { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() };
      const before = new SoftwareSurface(320, 240),
        after = new SoftwareSurface(320, 240),
        successorOnly = new SoftwareSurface(320, 240);
      let committed = false;
      for (let tick = 0; tick < 4; tick++) {
        const previous = { x: vehicle.x, z: vehicle.z };
        assert.equal(
          advanceVehicleWithRecovery(scene.world, vehicle, {
            state: actor.recovery,
            input: { steering: 0, throttle: false, brake: false },
            dt: 1 / 120,
          }),
          null,
        );
        const oldCamera = updateCamera({ ...actor.cameraRig }, scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 120);
        if (vehicle.course.s >= link.source.anchor.s) scene.render(before, vehicle, oldCamera, 'car', []);
        const direction = scene.observeStep(actor, previous, false);
        const camera = updateCamera(actor.cameraRig, scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 120);
        if (!direction) continue;
        assert.equal(direction, 'forward');
        committed = true;
        assert.deepEqual(link.overlap, { behind: 30, ahead: 30 });
        scene.render(after, vehicle, camera, 'car', []);
        createCourseScene(link.destination.section, ground, createTestSpriteAssets()).render(
          successorOnly,
          vehicle,
          camera,
          'car',
          [],
        );
        for (const [pixels, reason] of [
          [before, 'rigid frame commit'],
          [successorOnly, 'parent-specific pixels cleared'],
        ]) {
          const difference = pixels.pixels.reduce((n, p, i) => n + Number(p !== after.pixels[i]), 0);
          assert.ok(difference <= 2, `${link.id} ${offset}: ${reason}: ${difference} pixels`);
        }
        break;
      }
      assert.equal(committed, true);
    }
});

test('the actual driving graph rejects a fork whose undecided approach cannot supply driver lookahead', async () => {
  const source = structuredClone(document);
  source.sections[0].fork = { lock: { kind: 'absolute', s: 1300 }, closure: { kind: 'absolute', s: 1350 } };
  source.sections[0].presentation.scenery = [];
  const compiled = await compileCourseDocument(
    source,
    await readCourseImages(source.assets, new URL('../../content/images/', import.meta.url).pathname),
  );
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  assert.throws(
    () => createCourseScene(compiled.value.entry, ground, createTestSpriteAssets()),
    /pre-lock render and driver/,
  );
});
