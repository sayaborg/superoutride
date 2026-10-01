import { routeSectionS } from '../../src/course/course-route.js';
type CompiledLink = CompiledCourse['links'][number];
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import type { SessionVehicle } from '../../src/content/session-vehicle.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { REFERENCE_DRIVER } from './reference-driving-policy.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import type { DriverIntent } from '../../src/race/course-fork-field.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import {
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
  envelopeAt,
  compileEnvelopeDriver,
} from '../../src/race/envelope-driver.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { courseBoundaryAt, courseCarriagewayExists } from '../../src/course/course-boundaries.js';

const IDLE_INPUT = Object.freeze({ steering: 0, throttle: false, brake: false });

export function runCourseReference(
  course: CompiledCourse,
  vehicleConfiguration: SessionVehicle,
  vehicles: readonly CompiledVehicleDefinition[],
  envelope: RivalEnvelope,
  route: readonly CompiledLink[],
  lapCount: number,
  capture = false,
) {
  const entry = vehicleConfiguration.vehicleDefinition,
    scene = createCourseScene(course.entry, course.gates, vehicles);
  const session = resolveCourseSession(
    course,
    null,
    // Reference runs have no rivals, so the seed is fixed.
    { mode: 'FREE_PLAY', rivalCount: 0, lapCount, timeLimit: false, initialSpeed: 0, seed: 0 },
    vehicleConfiguration,
    envelope,
  );
  const slot = session.grid[0]!;
  const race = createCourseRace({ session, runtime: scene.runtime });
  const { actor } = race.player;
  const { vehicle } = actor;
  const events = [],
    trace = [];
  let previousTime = 0,
    distance = 0,
    maximumSpeed = 0,
    maximumLateralUtilization = 0;
  const planned = new Map(route.map((link) => [link.from.section, link]));
  // The planned Link at each fork is the intended exit.
  const intent: DriverIntent = {
    lane: slot.l,
    exit: (occurrence) =>
      occurrence.section.fork!.exits.findIndex((exit) => exit.link === planned.get(occurrence.section)),
  };
  const lane = (s: number) => race.forks.targetL(s, intent);
  const workspace = createEnvelopeDriverWorkspace();
  const driver = compileEnvelopeDriver(envelope, REFERENCE_DRIVER.utilization, envelope.maximumSpeed);
  race.start();
  // Work bound, not a replacement finish. A timed-out/recovered run publishes no reference product.
  const maxTicks = Math.ceil((READY_SECONDS + 3600 * lapCount) / SIM_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    const occurrence = scene.runtime.route.at(vehicle.course.s)!,
      section = occurrence.section;
    // The reference driver leaves the throttle closed during READY.
    const input =
      race.clock.status === 'READY'
        ? IDLE_INPUT
        : sampleEnvelopeDrivingInput(scene.world.coordinates, vehicle, driver, lane, workspace, scene.runtime.window);
    race.advance(input);
    if (actor.recovery.recoveries)
      throw new RangeError(`${entry.compiledVehicle.id}: reference recovered at ${section.id}:${vehicle.course.s}`);
    distance += vehicle.speed * SIM_DT;
    maximumSpeed = Math.max(maximumSpeed, vehicle.speed);
    const utilization =
      Math.abs(vehicle.yawRate * vehicle.longitudinalSpeed) /
      envelopeAt(envelope, vehicle.speed, workspace.envelope).lateral;
    maximumLateralUtilization = Math.max(maximumLateralUtilization, utilization);
    for (const event of race.events) {
      if (event.competitorId !== race.player.id) continue;
      const { timeSeconds } = event;
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
      throw new RangeError(`${entry.compiledVehicle.id}: reference did not finish within the work limit`);
    // Require the requested route to be reached physically, never select it on behalf of the field.
    const choice = section.fork ? race.forks.choice(occurrence) : null;
    if (choice && choice !== planned.get(section)) throw new RangeError('Reference selected an unintended route');
  }
  // Center following is verified against pavement; telemetry is descriptive, not force authority.
  const finalOccurrence = scene.runtime.route.at(vehicle.course.s)!;
  const finalSection = finalOccurrence.section;
  const finalS = routeSectionS(finalOccurrence, vehicle.course.s);
  const finalL = vehicle.course.l + finalOccurrence.lateralOrigin;
  const lateralBounds = finalSection.carriageways
    .filter((b) => courseCarriagewayExists(b, finalS, finalSection.coordinates.domain.end))
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
