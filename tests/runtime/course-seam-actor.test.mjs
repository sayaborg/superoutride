import { renderDriving } from '../../dist/render/renderer.js';
import { createCourseSpriteObservation } from '../../dist/render/course-sprite.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseSeamActor } from '../../dist/runtime/course-seam-actor.js';
import {
  createArcadeVehicle,
  updateArcadeVehicle,
  arcadeBodyKinematics,
} from '../../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation } from '../../dist/physics/vehicle-dynamics.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { createRecoveryState, recoverVehicle, RECOVERY_PROFILE } from '../../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import {
  transformPlanarPoint,
  transformPlanarVector,
  invertPlanarTransform,
} from '../../dist/core/planar-transform.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { createSeamDrivingFixture, seamDrivingView } from '../helpers/course-seam-driving.mjs';
import { cameraProfile, ok } from '../helpers/course-driving-probe.mjs';

const settings = {
  camera: cameraProfile,
  render: { width: 320, dMin: 2.5, dMax: 200 },
  recovery: RECOVERY_PROFILE,
  step: { behind: 1, ahead: 1 },
  targetL: 0.25,
};
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} vs ${b}`);
async function fixture(entry = VEHICLE_CATALOG[0], s = 1398, retainBehind = 1000) {
  const f = await createSeamDrivingFixture();
  f.traversal = createCourseGeometryTraversal(f.c.entry, { retainBehind, selectAhead: 1000, maxOccurrences: 4 });
  ok(f.traversal.select(f.traversal.snapshot().active, f.c.links[0]));
  return actorFrom(f, entry, s);
}
function actorFrom(f, entry = VEHICLE_CATALOG[0], s = 1398) {
  const world = seamDrivingView(f, s, 1).driving.world;
  const spawn = { s, l: 0.25, initialSpeed: 20, torqueProtection: entry.torqueProtection };
  const vehicle = createArcadeVehicle(entry.profile, world, spawn),
    rig = createCameraRig(),
    recovery = createRecoveryState(vehicle),
    camera = updateCamera(rig, world, vehicle, cameraProfile, 1 / 60);
  const actor = ok(
    createCourseSeamActor(
      f.source,
      f.traversal,
      f.traversal.snapshot().selected[0],
      vehicle,
      rig,
      recovery,
      camera,
      settings,
    ),
  );
  return { ...f, actor, vehicle, rig, recovery, world, spawn };
}

test('real nine-profile motion commits one frame atomically and preserves rigid state across straddling contacts', async () => {
  for (const entry of VEHICLE_CATALOG) {
    const f = await fixture(entry),
      initial = f.traversal.snapshot().active;
    const referenceWorld = {
      guide: f.c.entry.guide,
      height: f.c.entry.height,
      surfaces: createBandSurfaceReader(f.c.entry.bandPartition, f.c.entry.physicalBindings),
    };
    const reference = createArcadeVehicle(entry.profile, referenceWorld, f.spawn);
    const inverse = invertPlanarTransform(f.c.links[0].destinationFromSource);
    let commits = 0;
    for (let tick = 0; tick < 35; tick++) {
      const before = f.actor.snapshot(),
        world = before.view.world;
      updateArcadeVehicle(world, f.vehicle, sampleRivalDrivingInput(world.guide, f.vehicle, before.targetL), 1 / 60);
      if (before.frame === initial)
        updateArcadeVehicle(
          referenceWorld,
          reference,
          sampleRivalDrivingInput(referenceWorld.guide, reference, settings.targetL),
          1 / 60,
        );
      const camera = updateCamera(f.rig, world, f.vehicle, cameraProfile, 1 / 60);
      const position = { x: f.vehicle.x, z: f.vehicle.z },
        velocity = { x: f.vehicle.velocityX, z: f.vehicle.velocityZ },
        body = arcadeBodyKinematics(f.vehicle),
        seed = f.vehicle.course.segmentIndex,
        control = structuredClone(f.vehicle.control),
        wheels = [f.vehicle.frontWheelOmega, f.vehicle.rearWheelOmega],
        progress = f.recovery.recoveries;
      const result = f.actor.observeStep(camera);
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.committed) {
        commits++;
        assert.equal(result.direction, 'forward');
        assert.equal(f.actor.snapshot().frame, f.traversal.snapshot().active);
        assert.notEqual(f.actor.snapshot().frame, initial);
        const transformed = transformPlanarPoint(result.destinationFromSource, position),
          rotated = transformPlanarVector(result.destinationFromSource, velocity),
          omega = transformPlanarVector(result.destinationFromSource, { x: body.omegaWorld.x, z: body.omegaWorld.z });
        assert.equal(f.vehicle.x, transformed.x);
        assert.equal(f.vehicle.z, transformed.z);
        assert.equal(f.vehicle.velocityX, rotated.x);
        assert.equal(f.vehicle.velocityZ, rotated.z);
        const nextBody = arcadeBodyKinematics(f.vehicle);
        close(nextBody.omegaWorld.x, omega.x, 'angular x');
        close(nextBody.omegaWorld.z, omega.z, 'angular z');
        assert.deepEqual(f.vehicle.control, control);
        assert.deepEqual([f.vehicle.frontWheelOmega, f.vehicle.rearWheelOmega], wheels);
        assert.equal(f.recovery.recoveries, progress);
        for (const key of [
          'y',
          'pitch',
          'playerScreenX',
          'playerFrameError',
          'verticalCorrection',
          'cameraVehicleYawDelta',
        ])
          assert.equal(f.actor.snapshot().camera[key], camera[key], key);
        const contacts = [f.vehicle.profile.frontStation, f.vehicle.profile.rearStation].map((station) =>
          deriveContactObservation(world.guide, world.height, world.surfaces, body, station, 0, seed),
        );
        assert.ok(contacts[0].surface.coordinate.s > f.c.links[0].source.anchor.s);
        assert.ok(contacts[1].surface.coordinate.s < f.c.links[0].source.anchor.s);
        assert.ok(contacts.every((c) => c.supportAvailable));
      }
      const active = f.actor.snapshot().frame;
      if (before.frame === initial) {
        const observed = active === initial ? f.vehicle : transformPlanarPoint(inverse, f.vehicle);
        close(observed.x, reference.x, entry.profile.id + ' x');
        close(observed.z, reference.z, entry.profile.id + ' z');
        close(f.vehicle.y, reference.y, entry.profile.id + ' y');
        close(f.vehicle.longitudinalSpeed, reference.longitudinalSpeed, entry.profile.id + ' body speed');
      }
      // Subsequent solves use the new reader and its cache. Cross-basis floating-point integrations
      // are not a bit-identical oracle; the instantaneous transaction above is an exact rigid change.
      const reconstructed = f.actor.snapshot().view.world.guide.toWorld(f.vehicle.course.s, f.vehicle.course.l);
      close(reconstructed.x, f.vehicle.x, entry.profile.id + ' cached x');
      close(reconstructed.z, f.vehicle.z, entry.profile.id + ' cached z');
      assert.equal(f.vehicle.frontSupportAvailable, true);
      assert.equal(f.vehicle.rearSupportAvailable, true);
    }
    assert.equal(commits, 1, entry.profile.id);
    assert.equal(f.traversal.snapshot().occurrences.length, 2);
  }
});

function step(f, input = { steering: 0, throttle: 0, brake: 0 }) {
  const view = f.actor.snapshot().view;
  updateArcadeVehicle(view.world, f.vehicle, input, 1 / 60);
  const camera = updateCamera(f.rig, view.world, f.vehicle, cameraProfile, 1 / 60);
  return f.actor.observeStep(camera);
}

test('failed destination coverage and camera admission preserve the entire pending frame transaction', async () => {
  for (const retain of [0, 1000]) {
    const f = await fixture(VEHICLE_CATALOG[0], 1399.9, retain),
      before = f.actor.snapshot(),
      history = f.traversal.snapshot();
    updateArcadeVehicle(before.view.world, f.vehicle, { steering: 0, throttle: 0, brake: 0 }, 1 / 60);
    const camera = updateCamera(f.rig, before.view.world, f.vehicle, cameraProfile, 1 / 60);
    const pose = { x: f.vehicle.x, z: f.vehicle.z, yaw: f.vehicle.yaw, course: f.vehicle.course },
      rig = structuredClone(f.rig),
      recovery = structuredClone(f.recovery);
    const bad = retain === 0 ? camera : { ...camera, yaw: camera.yaw + Math.PI };
    const result = f.actor.observeStep(bad);
    assert.equal(result.ok, false);
    assert.equal(result.reason, retain === 0 ? 'coverage_gap' : 'camera_facing_unqualified');
    assert.equal(f.traversal.snapshot(), history);
    assert.deepEqual(f.actor.snapshot(), before);
    assert.deepEqual({ x: f.vehicle.x, z: f.vehicle.z, yaw: f.vehicle.yaw, course: f.vehicle.course }, pose);
    assert.deepEqual(f.rig, rig);
    assert.deepEqual(f.recovery, recovery);
    if (retain)
      assert.equal(
        f.actor.observeStep(camera).committed,
        true,
        'valid retry publishes the same physical crossing once',
      );
  }
});

test('reverse follows the visited inverse transform and recovery resets physical crossing observations', async () => {
  const f = await fixture(VEHICLE_CATALOG[0], 1399.9),
    initial = f.traversal.snapshot().active;
  assert.equal(step(f).committed, true);
  const successor = f.traversal.snapshot().active;
  f.vehicle.velocityX = -20 * Math.sin(f.vehicle.yaw);
  f.vehicle.velocityZ = -20 * Math.cos(f.vehicle.yaw);
  f.vehicle.frontWheelOmega = -20 / f.vehicle.profile.frontStation.rollingRadius;
  f.vehicle.rearWheelOmega = -20 / f.vehicle.profile.rearStation.rollingRadius;
  let reversed = false;
  for (let i = 0; i < 10 && !reversed; i++) {
    const result = step(f);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.committed) {
      assert.equal(result.direction, 'reverse');
      reversed = true;
    }
  }
  assert.equal(reversed, true);
  assert.equal(f.traversal.snapshot().active, initial);
  assert.equal(f.traversal.snapshot().occurrences[1], successor);
  const view = f.actor.snapshot().view;
  recoverVehicle(view.world, f.vehicle, {
    state: f.recovery,
    profile: { ...RECOVERY_PROFILE, targetL: f.actor.snapshot().targetL },
    target: { s: 1401, l: 0.25 },
  });
  const camera = updateCamera(f.rig, view.world, f.vehicle, cameraProfile, 1 / 60);
  assert.equal(f.actor.resetObservation(camera).ok, true);
  assert.equal(f.traversal.snapshot().active, initial, 'recovery crossing is not a physical seam event');
  const result = step(f);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.committed, false, 'departure after recovery cannot manufacture another arrival');
  assert.equal(f.recovery.recoveries, 1);
});

function renderFrame(snapshot, vehicle, pixels, assets, playerKind) {
  const d = snapshot.view,
    p = d.presentation,
    camera = snapshot.camera;
  return renderDriving(
    pixels,
    {
      background: p.backgroundAt(camera.s),
      guide: d.geometry,
      camera,
      vehicle,
      terrainProfile: {
        screenHeight: 240,
        dMin: 2.5,
        dMax: 200,
        ...p.groundProfile,
        roadLeft: 4,
        roadRight: 4,
        height: d.world.height,
        visual: p.visual,
      },
      groundProfile: p.groundProfile,
      worldSprites: snapshot.sprites,
      assets,
      playerKind,
    },
    { ground: p.ground },
  );
}

test('complete saved-content frames preserve camera and sprite observations across the real actor commit', async () => {
  const assets = createSpriteAssets();
  for (const entry of VEHICLE_CATALOG) {
    const f = await fixture(entry, 1399.9),
      before = f.actor.snapshot(),
      pixels = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
    updateArcadeVehicle(before.view.world, f.vehicle, { steering: 0, throttle: 0, brake: 0 }, 1 / 60);
    const camera = updateCamera(f.rig, before.view.world, f.vehicle, cameraProfile, 1 / 60);
    const observed = {
      ...before,
      camera,
      sprites: createCourseSpriteObservation(before.view.presentation.worldSprites, camera, 2.5, 200),
    };
    const kind = entry.presentationFamily === 'CAR' ? 'car' : 'bike';
    const a = renderFrame(observed, f.vehicle, pixels[0], assets, kind);
    const result = f.actor.observeStep(camera);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.committed, true);
    const after = f.actor.snapshot(),
      b = renderFrame(after, f.vehicle, pixels[1], assets, kind);
    assert.ok(a.terrainOutputPixels > 1000 && b.terrainOutputPixels > 1000);
    assert.deepEqual(pixels[1].pixels, pixels[0].pixels, entry.profile.id);
    assert.equal(after.sprites.sprites.length, before.sprites.sprites.length);
    assert.equal(after.view.presentation.worldSprites[0].asset, before.view.presentation.worldSprites[0].asset);
  }
});

test('every incoming merge commits and reverses to the actual driven predecessor', async () => {
  const shared = await createSeamDrivingFixture(0, 'fork-merge', (c) =>
    c.links.filter((l) => l.source.section.outgoing.length === 1),
  );
  for (const branch of shared.c.entry.outgoing) {
    const traversal = createCourseGeometryTraversal(shared.c.entry, {
      retainBehind: 1000,
      selectAhead: 1000,
      maxOccurrences: 5,
    });
    ok(traversal.select(traversal.snapshot().active, branch));
    ok(traversal.forward()); // Initial placement on a branch; the parent fork has no transfer certificate yet.
    const parent = traversal.snapshot().active,
      link = parent.section.outgoing[0];
    ok(traversal.select(parent, link));
    const f = actorFrom({ ...shared, traversal }, VEHICLE_CATALOG[0], 1399.9);
    assert.equal(step(f).committed, true);
    assert.equal(traversal.snapshot().active.incoming, link);
    assert.equal(f.actor.snapshot().frame.section, link.destination.section);
    f.vehicle.velocityX = -20 * Math.sin(f.vehicle.yaw);
    f.vehicle.velocityZ = -20 * Math.cos(f.vehicle.yaw);
    f.vehicle.frontWheelOmega = -20 / f.vehicle.profile.frontStation.rollingRadius;
    f.vehicle.rearWheelOmega = -20 / f.vehicle.profile.rearStation.rollingRadius;
    let reversed = false;
    for (let i = 0; i < 10 && !reversed; i++) {
      const result = step(f);
      assert.equal(result.ok, true, JSON.stringify(result));
      reversed = result.committed;
    }
    assert.equal(reversed, true);
    assert.equal(traversal.snapshot().active, parent);
  }
});

test('staggered actors sharing source readers commit independently', async () => {
  const shared = await createSeamDrivingFixture();
  const actors = [1399.9, 1398].map((s) => {
    const traversal = createCourseGeometryTraversal(shared.c.entry, {
      retainBehind: 1000,
      selectAhead: 1000,
      maxOccurrences: 4,
    });
    ok(traversal.select(traversal.snapshot().active, shared.c.links[0]));
    return actorFrom({ ...shared, traversal }, VEHICLE_CATALOG[0], s);
  });
  const slowBefore = actors[1].actor.snapshot(),
    slowHistory = actors[1].traversal.snapshot();
  assert.equal(step(actors[0]).committed, true);
  assert.equal(actors[1].traversal.snapshot(), slowHistory);
  assert.deepEqual(actors[1].actor.snapshot(), slowBefore);
  assert.equal(
    actors[0].actor.snapshot().view.presentation.worldSprites[0].asset,
    actors[1].actor.snapshot().view.presentation.worldSprites[0].asset,
  );
  let second = false;
  for (let i = 0; i < 10 && !second; i++) {
    const result = step(actors[1]);
    assert.equal(result.ok, true, JSON.stringify(result));
    second = result.committed;
  }
  assert.equal(second, true);
  assert.equal(actors[0].traversal.snapshot().active.section, actors[1].traversal.snapshot().active.section);
});
