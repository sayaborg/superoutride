import { readVehicleSprites } from './read-vehicle-sprites.mjs';
import { REFERENCE_DRIVER } from '../../dist/runtime/reference-driving-policy.js';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createCourseRace } from '../../dist/runtime/course-race.js';
import { resolveCourseSession } from '../../dist/runtime/course-session.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createRecoveryState } from '../../dist/gameplay/recovery.js';
import {
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
  envelopeAt,
  compileEnvelopeDriver,
} from '../../dist/gameplay/envelope-driver.js';
import { createCameraRig } from '../../dist/camera/camera.js';
import { SIM_DT } from '../../dist/browser/frame-loop.js';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';
const spriteAssets = await readVehicleSprites();

/** Enumerate canonical finite alternatives; one continuous run per history, no stitched sectors. */
export function courseReferenceRoutes(course) {
  if (course.type === 'CIRCUIT') return [[]];
  const routes = [];
  const visit = (section, links) => {
    if (routes.length >= 256) throw new RangeError('Reference work is limited to 256 finite routes');
    if (!section.outgoing.length) {
      routes.push(links);
      return;
    }
    for (const link of section.outgoing) visit(link.destination.section, [...links, link]);
  };
  visit(course.entry, []);
  return routes;
}

export function runCourseReference(course, ground, entry, envelope, route, lapCount, capture = false) {
  const scene = createCourseScene(course.entry, ground, spriteAssets),
    vehicleConfiguration = browserSessionVehicle(entry);
  const session = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: 0, lapCount, countdown: false },
    vehicleConfiguration,
  );
  const slot = session.grid[0];
  const vehicle = createArcadeVehicle(entry.profile, scene.world, {
    ...vehicleConfiguration,
    s: slot.anchor.s,
    l: slot.l,
    initialSpeed: 0,
  });
  const actor = { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() };
  const race = createCourseRace({
    sprites: spriteAssets,
    session,
    player: actor,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: vehicleConfiguration,
  });
  const events = [],
    trace = [];
  let previousTime = 0,
    distance = 0,
    maximumSpeed = 0,
    maximumLateralUtilization = 0;
  const planned = new Map(route.map((link) => [link.source.section, link]));
  const lane = (s) => {
    const section = scene.history.active.section,
      link = planned.get(section);
    const fallback =
      link && section.fork ? (section.fork.regions.findIndex((r) => r.link === link) === 0 ? -1 : 1) : slot.l;
    return race.forks.targetL(section, s, fallback);
  };
  const workspace = createEnvelopeDriverWorkspace();
  const driver = compileEnvelopeDriver(envelope, REFERENCE_DRIVER.utilization, envelope.maximumSpeed);
  race.start();
  // Work bound, not a replacement finish. A timed-out/recovered run publishes no reference product.
  const maxTicks = Math.ceil((3600 * lapCount) / SIM_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    const section = scene.history.active.section,
      startSeconds = race.clock.elapsedSeconds;
    const input = sampleEnvelopeDrivingInput(scene.world.guide, vehicle, driver, lane, workspace);
    race.advance(input, SIM_DT);
    if (actor.recovery.recoveries)
      throw new RangeError(`${entry.profile.id}: reference recovered at ${section.id}:${vehicle.course.s}`);
    distance += vehicle.speed * SIM_DT;
    maximumSpeed = Math.max(maximumSpeed, vehicle.speed);
    const utilization =
      Math.abs(vehicle.yawRate * vehicle.longitudinalSpeed) /
      envelopeAt(envelope, vehicle.speed, workspace.envelope).lateral;
    maximumLateralUtilization = Math.max(maximumLateralUtilization, utilization);
    for (const event of race.events) {
      const timeSeconds = startSeconds + event.u * SIM_DT;
      events.push({
        landmarkId: event.landmark.id,
        lap: event.lap,
        timeSeconds,
        intervalSeconds: timeSeconds - previousTime,
      });
      previousTime = timeSeconds;
    }
    if (capture && (tick % 6 === 0 || race.clock.status === 'GOAL'))
      trace.push({
        timeSeconds: race.clock.elapsedSeconds,
        sectionId: scene.history.active.section.id,
        lap: Math.min(lapCount, race.player.progress.acceptedFinishCount + 1),
        s: vehicle.course.s,
        l: vehicle.course.l,
        speed: vehicle.speed,
        lateralUtilization: utilization,
      });
    if (race.clock.status === 'GOAL') break;
    if (tick === maxTicks - 1)
      throw new RangeError(`${entry.profile.id}: reference did not finish within the work limit`);
    // Require the requested route to be reached physically, never select it on behalf of the field.
    if (section.fork && race.forks.choice(section.fork) && race.forks.choice(section.fork) !== planned.get(section))
      throw new RangeError('Reference selected an unintended route');
  }
  // Center following is verified against pavement; telemetry is descriptive, not force authority.
  const finalSection = scene.history.active.section;
  const lateralBounds = finalSection.bandPartition.bands
    .filter((b) => b.role === 'pavement' && b.start.s <= vehicle.course.s && b.end.s >= vehicle.course.s)
    .map((b) => [courseBoundaryAt(b.left, vehicle.course.s), courseBoundaryAt(b.right, vehicle.course.s)]);
  if (!lateralBounds.some(([left, right]) => vehicle.course.l >= left && vehicle.course.l < right))
    throw new RangeError('Reference FINISH lies outside pavement');
  return {
    links: route.map((l) => l.id),
    lapCount,
    elapsedSeconds: race.clock.elapsedSeconds,
    events,
    metrics: { maximumSpeed, maximumLateralUtilization, distance, recoveries: actor.recovery.recoveries },
    ...(capture ? { trace } : {}),
  };
}
