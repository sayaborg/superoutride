import { routeSectionS } from '../../src/course/course-route.js';
type CompiledSection = CompiledCourse['sections'][number];
type CompiledLink = CompiledCourse['links'][number];
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CourseGround } from '../../src/course/compiler/course-ground.js';
import type { VehicleCatalogEntry } from '../../src/vehicle/vehicle-catalog.js';
import type { VehicleEnvelope } from '../../src/race/envelope-driver.js';
import { readVehicleSprites } from './read-vehicle-sprites.js';
import { REFERENCE_DRIVER } from './reference-driving-policy.js';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { createArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { createRecoveryState } from '../../src/race/recovery.js';
import {
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
  envelopeAt,
  compileEnvelopeDriver,
} from '../../src/race/envelope-driver.js';
import { SIM_DT } from '../../src/shell/frame-loop.js';
import { courseBoundaryAt } from '../../src/course/course-regions.js';
const spriteAssets = await readVehicleSprites();

/** Enumerate canonical finite alternatives; one continuous run per history, no stitched sectors. */
export function courseReferenceRoutes(course: CompiledCourse) {
  if (course.type === 'CIRCUIT') return [[]];
  const routes: CompiledLink[][] = [];
  const visit = (section: CompiledSection, links: CompiledLink[]) => {
    if (routes.length >= 256) throw new RangeError('Reference work is limited to 256 finite routes');
    if (!section.outgoing.length) {
      routes.push(links);
      return;
    }
    for (const link of section.outgoing) visit(link.to.section, [...links, link]);
  };
  visit(course.entry, []);
  return routes;
}

export function runCourseReference(
  course: CompiledCourse,
  ground: CourseGround,
  entry: Readonly<VehicleCatalogEntry>,
  envelope: VehicleEnvelope,
  route: readonly CompiledLink[],
  lapCount: number,
  capture = false,
) {
  const scene = createCourseScene(course.entry, ground, spriteAssets, course.rules),
    vehicleConfiguration = browserSessionVehicle(entry);
  const session = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: 0, lapCount, countdown: false },
    vehicleConfiguration,
    envelope,
  );
  const slot = session.grid[0]!;
  const vehicle = createArcadeVehicle(entry.profile, scene.world, {
    ...vehicleConfiguration,
    s: slot.at.s,
    l: slot.l,
    initialSpeed: 0,
  });
  const actor = { vehicle, recovery: createRecoveryState(vehicle) };
  const race = createCourseRace({
    session,
    player: actor,
    runtime: scene.runtime,
  });
  const events = [],
    trace = [];
  let previousTime = 0,
    distance = 0,
    maximumSpeed = 0,
    maximumLateralUtilization = 0;
  const planned = new Map(route.map((link) => [link.from.section, link]));
  const lane = (s: number) => {
    const occurrence = scene.runtime.route.at(s)!,
      section = occurrence.section,
      link = planned.get(section);
    const fallback =
      link && section.fork ? (section.fork.regions.findIndex((r) => r.link === link) === 0 ? -1 : 1) : slot.l;
    return race.forks.targetL(s, fallback);
  };
  const workspace = createEnvelopeDriverWorkspace();
  const driver = compileEnvelopeDriver(envelope, REFERENCE_DRIVER.utilization, envelope.maximumSpeed);
  race.start();
  // Work bound, not a replacement finish. A timed-out/recovered run publishes no reference product.
  const maxTicks = Math.ceil((3600 * lapCount) / SIM_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    const section = scene.runtime.route.at(vehicle.course.s)!.section,
      startSeconds = race.clock.elapsedSeconds;
    const input = sampleEnvelopeDrivingInput(
      scene.world.coordinates,
      vehicle,
      driver,
      lane,
      workspace,
      scene.runtime.route,
    );
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
        sectionId: scene.runtime.route.at(vehicle.course.s)!.section.id,
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
  const finalOccurrence = scene.runtime.route.at(vehicle.course.s)!;
  const finalSection = finalOccurrence.section;
  const finalS = routeSectionS(finalOccurrence, vehicle.course.s);
  const finalL = vehicle.course.l + finalOccurrence.lateralOrigin;
  const lateralBounds = finalSection.regionPartition.regions
    .filter((b) => b.role === 'pavement' && b.start.s <= finalS && b.end.s >= finalS)
    .map((b) => [courseBoundaryAt(b.left, finalS), courseBoundaryAt(b.right, finalS)] as const);
  if (!lateralBounds.some(([left, right]) => finalL >= left && finalL < right))
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
