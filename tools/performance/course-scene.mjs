import { Session } from 'node:inspector/promises';
import { loadCourse, loadCourseGround, options, finite } from '../course/authoring-io.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../../dist/gameplay/recovery.js';
import { createCameraRig, updateCamera, resetCameraRig } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY as vehicle } from '../../dist/vehicle/vehicle-catalog.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';

const flags = options(process.argv.slice(2), ['--frames', '--rivals', '--mode']);
const frames = finite(Number(flags.get('--frames') ?? 300), '/frames', 60, 10000);
const rivalCount = finite(Number(flags.get('--rivals') ?? 16), '/rivals', 0, 16);
const modes = flags.has('--mode') ? [flags.get('--mode')] : ['linear', 'seam', 'circuit', 'branch'];
const statistics = (samples) => {
  const sorted = samples.toSorted((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
    max: sorted.at(-1),
  };
};
const inspector = new Session();
inspector.connect();
const reports = [];
for (const mode of modes) {
  if (!['linear', 'seam', 'circuit', 'branch'].includes(mode)) throw new RangeError('Unknown course mode');
  const { course } = await loadCourse(`content/courses/${mode}.course.json`);
  const ground = await loadCourseGround(course, `content/courses/${mode}.course.json`);
  const started = performance.now();
  const scene = createCourseScene(course.entry, ground);
  const player = {
    vehicle: createArcadeVehicle(vehicle.profile, scene.world, {
      s: 45,
      l: 0,
      initialSpeed: 45,
      torqueProtection: vehicle.torqueProtection,
    }),
    cameraRig: createCameraRig(),
  };
  player.recovery = createRecoveryState(player.vehicle);
  const race = createCourseRace({
    course,
    player,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rivalCount,
    lapCount: 2,
    rival: { profile: vehicle.profile, torqueProtection: vehicle.torqueProtection, kind: 'car' },
  });
  const setupMilliseconds = performance.now() - started;
  // Begin at a representative curve, handoff or fork; setup/reposition cost is excluded from driving cost.
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
  const step = [],
    frame = [],
    render = [];
  for (let i = 0; i < frames + 30; i += 1) {
    const begin = performance.now();
    const recovered = race.advance(sampleRivalDrivingInput(scene.world.guide, player.vehicle), 1 / 60);
    const camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
    const afterStep = performance.now();
    const observations = race.observe(camera);
    scene.render(target, player.vehicle, camera, 'car', observations.sprites);
    const end = performance.now();
    if (i >= 30) {
      step.push(afterStep - begin);
      render.push(end - afterStep);
      frame.push(end - begin);
    }
    if (recovered) resetCameraRig(player.cameraRig);
  }
  const measuredMetrics = { ...scene.metrics };
  await inspector.post('HeapProfiler.startSampling', {
    samplingInterval: 16384,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const allocationFrames = 30;
  for (let i = 0; i < allocationFrames; i += 1) {
    if (race.advance(sampleRivalDrivingInput(scene.world.guide, player.vehicle), 1 / 60))
      resetCameraRig(player.cameraRig);
    const camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
    scene.render(target, player.vehicle, camera, 'car', race.observe(camera).sprites);
  }
  const { profile } = await inspector.post('HeapProfiler.stopSampling');
  const sum = (node) => node.selfSize + node.children.reduce((n, child) => n + sum(child), 0);
  const sampledAllocationBytes = sum(profile.head);
  reports.push({
    mode,
    rivalCount,
    frames,
    setupMilliseconds,
    ground: scene.groundMetrics,
    fixedStepMilliseconds: statistics(step),
    renderMilliseconds: statistics(render),
    frameMilliseconds: statistics(frame),
    ...measuredMetrics,
    sampledAllocationBytes,
    sampledBytesPerFrame: sampledAllocationBytes / allocationFrames,
    heapUsedBytes: process.memoryUsage().heapUsed,
  });
}
inspector.disconnect();
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      allocationMethod:
        'V8 sampled allocations including collected objects; 16 KiB sampling interval; separate 30-frame allocation pass excluded from timing',
      scope: 'CPU host scene, excluding browser/audio/compositor; device 60 fps requires live HUD evidence',
      reports,
    },
    null,
    2,
  ),
);
