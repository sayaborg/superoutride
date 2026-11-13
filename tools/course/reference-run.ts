import { routeSectionS } from '../../src/course/course-route.js';
type CompiledLink = CompiledCourse['links'][number];
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import type { RunVehicle } from '../../src/content/run-vehicle.js';
import {
  createPlannedDriverWorkspace,
  PLANNED_DRIVER,
  samplePlannedDrivingInput,
} from '../../src/race/planned-driver.js';
import { racingLinePath } from './line-time.js';
import type { RacingLines } from '../../src/content/racing-line.js';
import type { RacingLineProcedure } from './racing-line.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { NO_TRAFFIC, type FreePlayRules } from '../../src/content/free-play-rules.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';

const REVVING = Object.freeze({ steering: 0, throttle: true, brake: false });

/**
 * The reference run procedure's record ([procedure](./procedure.ts)): the race's fixed step, the run seed and the
 * planned driver's policy, which the standard driver drives by.
 */
export const REFERENCE_RUN = Object.freeze({
  name: 'superoutride.reference-driving',
  version: 12,
  dt: SIM_DT,
  seed: 0,
  driver: PLANNED_DRIVER,
});

/** The reference run's whole record: its own and the racing line procedure's, whose lines it drives. */
export function referenceProcedure(racingLine: RacingLineProcedure) {
  return Object.freeze({ ...REFERENCE_RUN, racingLine });
}

export function runCourseReference(
  course: CompiledCourse,
  vehicleConfiguration: RunVehicle,
  catalog: { readonly vehicles: readonly CompiledVehicleDefinition[]; readonly freePlay: FreePlayRules },
  route: readonly CompiledLink[],
  lapCount: number,
  lines: RacingLines,
  capture = false,
) {
  const entry = vehicleConfiguration.vehicleDefinition,
    scene = createCourseScene(course.entry, course.gates, catalog.vehicles);
  // A reference run is a FREE PLAY run alone, no rivals, no traffic and no clock, but from the last slot of the grid
  // its vehicle starts from (`courseStartGrid`), where a FREE PLAY run alone starts from the first; the seed is fixed.
  const configuration = compileRunConfiguration(
    {
      mode: 'FREE_PLAY',
      vehicleId: entry.compiledVehicle.id,
      color: null,
      lapCount,
      rivalCount: 0,
      rivalPool: catalog.freePlay.rivalPools[0]!.id,
      traffic: NO_TRAFFIC,
    },
    course,
    null,
    catalog,
  );
  const alone = resolveRunSetup(course, null, configuration, REFERENCE_RUN.seed, vehicleConfiguration);
  const last = courseStartGrid(course.gates, entry.listing.form === 'bike').at(-1)!;
  const setup = Object.freeze({
    ...alone,
    entries: Object.freeze([Object.freeze({ ...alone.entries[0]!, slot: last })]),
  });
  // The standard driver drives the player's vehicle alone (K, 2026-11-12), steering by the planned drivers' one rule.
  const race = createCourseRace({ setup, runtime: scene.runtime, playerSteering: PLANNED_DRIVER.steering });
  const { actor } = race.player;
  const { vehicle } = actor;
  const events = [],
    trace = [];
  let previousTime = 0,
    distance = 0,
    maximumSpeed = 0,
    maximumUtilization = 0;
  const planned = new Map(route.map((link) => [link.from.section, link]));
  // Its path: the racing line; the planned Link at each fork is the intended exit.
  const lane = racingLinePath(scene.runtime.route, lines, (occurrence) =>
    occurrence.section.fork!.exits.findIndex((exit) => exit.link === planned.get(occurrence.section)),
  );
  const workspace = createPlannedDriverWorkspace();
  // The standard driver: the standard role's utilization at the vehicle's speed cap.
  const driver = setup.driverOf(vehicleConfiguration);
  race.start();
  // Work bound, not a replacement finish. A timed-out run publishes no reference product; a recovered one goes on, its
  // times including the recovery, and counts its recoveries.
  const maxTicks = Math.ceil((READY_SECONDS + 3600 * lapCount) / SIM_DT);
  for (let tick = 0; tick < maxTicks; tick++) {
    const occurrence = scene.runtime.route.at(vehicle.course.s)!,
      section = occurrence.section;
    // The standard driver waits through READY at full throttle, as every driver does (K, 2026-11-12).
    const input =
      race.outcome.status === 'READY'
        ? REVVING
        : samplePlannedDrivingInput(scene.world, vehicle, driver, lane, workspace, scene.runtime.window, true);
    race.advance(input);
    distance += vehicle.speed * SIM_DT;
    maximumSpeed = Math.max(maximumSpeed, vehicle.speed);
    // The friction-ellipse fraction of the more used tire.
    const utilization = Math.max(vehicle.tires.front.utilization, vehicle.tires.rear.utilization);
    maximumUtilization = Math.max(maximumUtilization, utilization);
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
        utilization,
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
    metrics: { maximumSpeed, maximumUtilization, distance, recoveries: actor.recovery.recoveries },
    ...(capture ? { trace } : {}),
  };
}
