import { readFile } from 'node:fs/promises';
import { loadCourse, loadCourseGround } from '../course/authoring-io.mjs';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { resolveCourseSession } from '../../dist/runtime/course-session.js';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { readVehicleEnvelope } from '../../dist/runtime/vehicle-envelope.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../../dist/gameplay/recovery.js';
import { createCameraRig, updateCamera, resetCameraRig } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY as vehicle } from '../../dist/vehicle/vehicle-catalog.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../dist/gameplay/envelope-driver.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { createBandTrialScene } from './band-trial-scene.mjs';

/** Match the ordinary course-scene probe's driver, field, step, warmup and starting region. */
export async function createBandSceneProbe(mode, variant, rivals) {
  if (!['linear', 'seam', 'circuit', 'branch'].includes(mode)) throw new RangeError('Unknown course mode');
  if (!['resident', 'direct', 'filtered'].includes(variant)) throw new RangeError('Unknown ground variant');
  const { course } = await loadCourse(`content/courses/${mode}.course.json`);
  const ground = await loadCourseGround(course, `content/courses/${mode}.course.json`);
  const sessionVehicle = browserSessionVehicle(vehicle);
  const envelope = await readVehicleEnvelope(
    sessionVehicle,
    JSON.parse(await readFile(`dist/content/envelopes/${vehicle.profile.id}.json`, 'utf8')),
  );
  const scene = createCourseScene(course.entry, ground);
  const player = {
    vehicle: createArcadeVehicle(vehicle.profile, scene.world, {
      ...sessionVehicle,
      s: 45,
      l: 0,
      initialSpeed: 45,
      torqueProtection: vehicle.torqueProtection,
    }),
    cameraRig: createCameraRig(),
  };
  player.recovery = createRecoveryState(player.vehicle);
  const session = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: rivals, lapCount: course.rules.maxLaps, countdown: false },
    sessionVehicle,
  );
  const driver = compileEnvelopeDriver(envelope, session.rivalUtilization, envelope.maximumSpeed);
  const race = createCourseRace({
    session,
    player,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: sessionVehicle,
    rivalEnvelope: envelope,
  });
  race.start();
  const s = course.entry.fork ? course.entry.fork.lock.s - 15 : (course.entry.outgoing[0]?.source.anchor.s ?? 900) - 15;
  for (const c of [race.player, ...race.rivals]) {
    recoverVehicleToGuideCoordinate(c.session.view.world, c.actor.vehicle, {
      state: c.actor.recovery,
      reason: 'manual',
      target: { s, l: c.targetL },
    });
    c.observer.resync();
  }
  const target = new SoftwareSurface(320, 240);
  const workspace = createEnvelopeDriverWorkspace();
  const trial = variant === 'resident' ? null : createBandTrialScene(scene, course, variant === 'filtered');
  const renderer = trial ?? scene;
  let camera;
  let recovered = false;
  return {
    scene,
    course,
    player,
    race,
    target,
    trial,
    step() {
      recovered = race.advance(
        sampleEnvelopeDrivingInput(scene.world.guide, player.vehicle, driver, 0, workspace),
        1 / 60,
      );
      camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
    },
    render() {
      renderer.render(target, player.vehicle, camera, 'car', race.observe(camera).sprites);
    },
    afterFrame() {
      if (recovered) resetCameraRig(player.cameraRig);
    },
  };
}
