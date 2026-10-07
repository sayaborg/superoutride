import { routeS, routeSectionS } from '../../src/course/course-route.js';
import { paceScheduleStations } from '../../src/content/pace-schedule.js';
type CompiledLink = CompiledCourse['links'][number];
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import type { SessionVehicle } from '../../src/content/session-vehicle.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { REFERENCE_DRIVER, referenceLine } from './reference-driving-policy.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { compileSessionConfiguration } from '../../src/race/session-configuration.js';
import type { FreePlayRules } from '../../src/content/free-play-rules.js';
import {
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
  envelopeAt,
  compileEnvelopeDriver,
} from '../../src/race/envelope-driver.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { ENVELOPE_MEASUREMENT } from './rival-envelope-measurement.js';
import { PACE_SCHEDULE_SPACING } from '../../src/content/pace-schedule.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';

const IDLE_INPUT = Object.freeze({ steering: 0, throttle: false, brake: false });

/**
 * The reference run procedure's record ([procedure](./procedure.ts)): the race's fixed step, the Session seed, the
 * reference driver, the measurement of the envelope it drives with and the pace schedule's station spacing.
 */
export const REFERENCE_RUN = Object.freeze({
  name: 'superoutride.reference-driving',
  version: 2,
  dt: SIM_DT,
  seed: 0,
  driver: REFERENCE_DRIVER,
  envelope: ENVELOPE_MEASUREMENT,
  scheduleSpacing: PACE_SCHEDULE_SPACING,
});

export function runCourseReference(
  course: CompiledCourse,
  vehicleConfiguration: SessionVehicle,
  catalog: { readonly vehicles: readonly CompiledVehicleDefinition[]; readonly freePlay: FreePlayRules },
  envelope: RivalEnvelope,
  route: readonly CompiledLink[],
  lapCount: number,
  capture = false,
) {
  const entry = vehicleConfiguration.vehicleDefinition,
    scene = createCourseScene(course.entry, course.gates, catalog.vehicles, {
      camera: CAMERA_DEFINITION,
      footprint: entry.compiledVehicle.footprint,
    });
  // A reference run is a TIME TRIAL Session: alone from the last grid slot, without a clock; the seed is fixed.
  const configuration = compileSessionConfiguration(
    { mode: 'TIME_TRIAL', vehicleId: entry.compiledVehicle.id, color: null, lapCount },
    course,
    null,
    catalog,
  );
  const session = resolveCourseSession(course, null, configuration, REFERENCE_RUN.seed, vehicleConfiguration, envelope);
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
  // The reference line: the centre lane; the planned Link at each fork is the intended exit.
  const lane = referenceLine(scene.runtime.route, (occurrence) =>
    occurrence.section.fork!.exits.findIndex((exit) => exit.link === planned.get(occurrence.section)),
  );
  const workspace = createEnvelopeDriverWorkspace();
  const driver = compileEnvelopeDriver(envelope, REFERENCE_RUN.driver.utilization, envelope.maximumSpeed, true);
  // Race time and route station after every step from GO: the pass times at schedule stations interpolate them.
  const samples = { seconds: [0], s: [vehicle.course.s] };
  race.start();
  // Work bound, not a replacement finish. A timed-out/recovered run publishes no reference product.
  const maxTicks = Math.ceil((READY_SECONDS + 3600 * lapCount) / SIM_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    const occurrence = scene.runtime.route.at(vehicle.course.s)!,
      section = occurrence.section;
    // The reference driver leaves the throttle closed during READY.
    const input =
      race.outcome.status === 'READY'
        ? IDLE_INPUT
        : sampleEnvelopeDrivingInput(scene.world, vehicle, driver, lane, workspace, scene.runtime.window);
    race.advance(input);
    if (race.outcome.status !== 'READY') {
      samples.seconds.push(race.clock.elapsedSeconds);
      samples.s.push(vehicle.course.s);
    }
    if (actor.recovery.recoveries)
      throw new RangeError(`${entry.compiledVehicle.id}: reference recovered at ${section.id}:${vehicle.course.s}`);
    distance += vehicle.speed * SIM_DT;
    maximumSpeed = Math.max(maximumSpeed, vehicle.speed);
    const utilization =
      Math.abs(vehicle.yawRate * vehicle.longitudinalSpeed) /
      envelopeAt(envelope, vehicle.speed, workspace.row).lateral;
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
    if (capture && (tick % 6 === 0 || race.outcome.status === 'GOAL'))
      trace.push({
        timeSeconds: race.clock.elapsedSeconds,
        sectionId: scene.runtime.route.at(vehicle.course.s)!.section.id,
        lap: Math.min(lapCount, race.player.progress.acceptedFinishCount + 1),
        s: vehicle.course.s,
        l: vehicle.course.l,
        speed: vehicle.speed,
        lateralUtilization: utilization,
      });
    if (race.outcome.status === 'GOAL') break;
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
  const lateralBounds = courseRoadsAt(finalSection.lanes, finalS).map((road) => [road.left, road.right] as const);
  if (!lateralBounds.some(([left, right]) => finalL >= left && finalL < right))
    throw new RangeError('Reference FINISH lies outside pavement');
  return {
    links: route.map((l) => l.id),
    lapCount,
    elapsedSeconds: race.clock.elapsedSeconds,
    events,
    passes: passTimes(scene.runtime.route.occurrences, samples),
    metrics: { maximumSpeed, maximumLateralUtilization, distance, recoveries: actor.recovery.recoveries },
    ...(capture ? { trace } : {}),
  };
}

/**
 * Each Section occurrence's race times at its schedule stations, from the first station the run reaches to the last
 * it passes: the first sample at or past a station, interpolated linearly from the one before it.
 */
function passTimes(
  occurrences: ReturnType<typeof createCourseScene>['runtime']['route']['occurrences'],
  samples: { readonly seconds: readonly number[]; readonly s: readonly number[] },
) {
  const { seconds, s } = samples;
  const firstS = s[0]!,
    lastS = s.at(-1)!;
  let i = 1;
  const passes: { section: string; first: number; seconds: number[] }[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.start > lastS) break;
    const stations = paceScheduleStations(occurrence.section);
    const times: number[] = [];
    let first = -1;
    stations.forEach((station, index) => {
      const at = routeS(occurrence, station);
      if (at < firstS || at > lastS) return;
      if (first < 0) first = index;
      while (s[i]! < at) i++;
      const before = Math.max(0, i - 1);
      const span = s[i]! - s[before]!;
      times.push(
        span > 0 ? seconds[before]! + ((at - s[before]!) / span) * (seconds[i]! - seconds[before]!) : seconds[i]!,
      );
    });
    if (first >= 0) passes.push({ section: occurrence.section.id, first, seconds: times });
  }
  return passes;
}
