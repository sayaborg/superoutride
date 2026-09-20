import { resolveCourseSession } from '../../dist/runtime/course-session.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { Session } from 'node:inspector/promises';
import { PerformanceObserver } from 'node:perf_hooks';
import { loadCourse, loadCourseGround, options, finite } from '../course/authoring-io.mjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../../dist/gameplay/recovery.js';
import { createCameraRig, updateCamera, resetCameraRig } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY as vehicle } from '../../dist/vehicle/vehicle-catalog.js';
import * as rivalDriver from '../../dist/gameplay/rival-driver.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { summarizeSceneProfile } from './scene-profile.mjs';

const flags = options(process.argv.slice(2), ['--frames', '--rivals', '--mode', '--compare']);
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
for (const mode of modes)
  for (const rivals of flags.has('--compare') ? [0, rivalCount] : [rivalCount]) {
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
      session: resolveCourseSession(
        course,
        { mode: 'CUSTOM', rivalCount: rivals, lapCount: course.rules.maxLaps, countdown: false },
        browserSessionVehicle(vehicle),
      ),
      player,
      playerSession: scene.session,
      createSession: scene.createActorSession,
      rival: browserSessionVehicle(vehicle),
    });
    race.start();
    const setupMilliseconds = performance.now() - started;
    // Begin at a representative curve, handoff or fork; setup/reposition cost is excluded from driving cost.
    const s = course.entry.fork
      ? course.entry.fork.lock.s - 15
      : (course.entry.outgoing[0]?.source.anchor.s ?? 900) - 15;
    for (const c of [race.player, ...race.rivals]) {
      recoverVehicleToGuideCoordinate(c.session.view.world, c.actor.vehicle, {
        state: c.actor.recovery,
        reason: 'manual',
        target: { s, l: c.targetL },
      });
      c.observer.resync();
    }
    const target = new SoftwareSurface(320, 240);
    const driverWorkspace = rivalDriver.createRivalDriverWorkspace?.();
    const gcEntries = [],
      frameBounds = new Float64Array(frames * 2);
    const observer = new PerformanceObserver((list) => gcEntries.push(...list.getEntries()));
    observer.observe({ entryTypes: ['gc'] });
    const step = [],
      frame = [],
      render = [];
    for (let i = 0; i < frames + 30; i += 1) {
      const begin = performance.now();
      const recovered = race.advance(
        rivalDriver.sampleRivalDrivingInput(scene.world.guide, player.vehicle, 0, driverWorkspace),
        1 / 60,
      );
      const camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
      const afterStep = performance.now();
      const observations = race.observe(camera);
      scene.render(target, player.vehicle, camera, 'car', observations.sprites);
      const end = performance.now();
      if (i >= 30) {
        frameBounds[(i - 30) * 2] = begin;
        frameBounds[(i - 30) * 2 + 1] = end;
        step.push(afterStep - begin);
        render.push(end - afterStep);
        frame.push(end - begin);
      }
      if (recovered) resetCameraRig(player.cameraRig);
    }
    // GC performance entries are delivered on the next observer turn.
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    observer.disconnect();
    const overlap = (event, start, end) =>
      Math.max(0, Math.min(end, event.startTime + event.duration) - Math.max(start, event.startTime));
    const gcPerFrame = frame.map((_, i) =>
      gcEntries.reduce((sum, event) => sum + overlap(event, frameBounds[i * 2], frameBounds[i * 2 + 1]), 0),
    );
    const maxFrameIndex = frame.indexOf(Math.max(...frame));
    const gc = {
      events: gcEntries.filter((e) => overlap(e, frameBounds[0], frameBounds.at(-1)) > 0).length,
      milliseconds: gcPerFrame.reduce((a, b) => a + b, 0),
      frameMaxMilliseconds: Math.max(...gcPerFrame),
      slowestFrameGcMilliseconds: gcPerFrame[maxFrameIndex],
    };
    const measuredMetrics = { ...scene.metrics };
    await inspector.post('HeapProfiler.startSampling', {
      samplingInterval: 16384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    const allocationFrames = 30;
    for (let i = 0; i < allocationFrames; i += 1) {
      if (
        race.advance(rivalDriver.sampleRivalDrivingInput(scene.world.guide, player.vehicle, 0, driverWorkspace), 1 / 60)
      )
        resetCameraRig(player.cameraRig);
      const camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
      scene.render(target, player.vehicle, camera, 'car', race.observe(camera).sprites);
    }
    const { profile } = await inspector.post('HeapProfiler.stopSampling');
    await inspector.post('Profiler.enable');
    await inspector.post('Profiler.setSamplingInterval', { interval: 100 });
    await inspector.post('Profiler.start');
    for (let i = 0; i < 60; i += 1) {
      if (
        race.advance(rivalDriver.sampleRivalDrivingInput(scene.world.guide, player.vehicle, 0, driverWorkspace), 1 / 60)
      )
        resetCameraRig(player.cameraRig);
      const camera = updateCamera(player.cameraRig, scene.world, player.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
      scene.render(target, player.vehicle, camera, 'car', race.observe(camera).sprites);
    }
    const { profile: cpu } = await inspector.post('Profiler.stop');
    await inspector.post('Profiler.disable');
    const sum = (node) => node.selfSize + node.children.reduce((n, child) => n + sum(child), 0);
    const sampledAllocationBytes = sum(profile.head);
    reports.push({
      mode,
      rivalCount: rivals,
      frames,
      setupMilliseconds,
      ground: scene.groundMetrics,
      fixedStepMilliseconds: statistics(step),
      renderMilliseconds: statistics(render),
      frameMilliseconds: statistics(frame),
      gc,
      ...measuredMetrics,
      sampledAllocationBytes,
      sampledBytesPerFrame: sampledAllocationBytes / allocationFrames,
      allocation: summarizeSceneProfile(profile, allocationFrames),
      cpu: summarizeSceneProfile(cpu, 60, true),
      heapUsedBytes: process.memoryUsage().heapUsed,
    });
  }
inspector.disconnect();
if (flags.has('--compare'))
  for (let i = 0; i < reports.length; i += 2) {
    const base = reports[i],
      field = reports[i + 1];
    const difference = (key) =>
      Object.fromEntries(
        ['physics', 'view', 'driver', 'progress', 'render', 'other'].map((category) => [
          category,
          ((field[key].categoriesPerFrame[category] ?? 0) - (base[key].categoriesPerFrame[category] ?? 0)) / rivalCount,
        ]),
      );
    field.perRival = {
      sampledBytesPerFrame: (field.sampledBytesPerFrame - base.sampledBytesPerFrame) / rivalCount,
      fixedStepMilliseconds: (field.fixedStepMilliseconds.median - base.fixedStepMilliseconds.median) / rivalCount,
      allocationBytesByCategory: difference('allocation'),
      cpuMillisecondsByCategory: difference('cpu'),
    };
  }
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
