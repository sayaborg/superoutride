import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { options, reportError, requireCompiled, requireInput } from './authoring-io.js';
import { REFERENCE_DRIVER, referenceLine } from './reference-driving-policy.js';
import { readRacingLines } from '../../src/content/racing-line.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { createRunVehicle, type RunVehicle } from '../../src/content/run-vehicle.js';
import { NO_TRAFFIC } from '../../src/content/free-play-rules.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { routeSectionS, type RouteOccurrence } from '../../src/course/course-route.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { DRIFT_DRIVER } from '../../src/race/drift-driving.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import {
  compilePlannedDriver,
  createPlannedDriverWorkspace,
  planDriving,
  plannedDrivingInput,
  resetPlannedDriving,
  type DriverLeader,
  type DrivingStyle,
} from '../../src/race/planned-driver.js';
import { compileRunConfiguration } from '../../src/race/run-configuration.js';
import { resolveRunSetup } from '../../src/race/run-setup.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { createCourseScene } from '../../src/view/course-scene.js';

/*
 * DRIFT EVALUATION, an evaluation and not a check (CI does not run it): one vehicle alone in FREE PLAY on a route's
 * reference line, driven by a planned driver of a driving style as the player under that driver's own rule (the
 * vehicle's `wheelSlip` holds, so a DRIFT TUNED vehicle drives without protection), beside the race's own run driver of
 * the same vehicle (an advance without input). With `--ghost` it first records a grip drive at that utilization and
 * places the record `--ghost-distance` metres ahead as the vehicle ahead the evaluated driver plans behind, a ghost
 * that touches nothing. It prints each drive's measures and the evaluated drive's corners as Markdown tables.
 */

const USAGE =
  'Usage: npm run drift-evaluation -- --course ID --vehicle ID [--laps N] [--utilization U] [--route N] ' +
  '[--style drift|grip] [--ghost U] [--ghost-distance M]';
const IDLE = Object.freeze({ steering: 0, throttle: false, brake: false });
const DEGREE = Math.PI / 180;
/**
 * A corner: where the path is tighter than this radius (m), its curvature read over a chord of `CORNER_CHORD` metres;
 * passes less than `CORNER_GAP` metres apart are one corner.
 */
const CORNER_RADIUS = 120;
const CORNER_CHORD = 20;
const CORNER_GAP = 20;
/** Degrees: sideslip beyond this is drifting, beyond `SPIN_ANGLE` a spin. */
const DRIFT_ANGLE = 15;
const SPIN_ANGLE = 90;
/** m/s: below this the sideslip is not read. */
const SIDESLIP_SPEED = 3;
/** Metres: the path is measured from once the vehicle has come this close to it from its grid slot. */
const ON_PATH = 0.5;
/** Seconds of race time a drive may take per lap before it counts as unfinished. */
const LAP_SECONDS = 1200;

interface Catalog {
  readonly vehicles: Parameters<typeof createCourseScene>[2];
  readonly freePlay: Parameters<typeof compileRunConfiguration>[3]['freePlay'];
}

/** A drive's record: race time, route station and speed after each step from GO, which a ghost replays. */
interface DriveRecord {
  readonly seconds: number[];
  readonly s: number[];
  readonly speed: number[];
}

/** How a drive is driven: by a planned driver as the player, or by the race's run driver. */
type Drive =
  | {
      readonly kind: 'player';
      readonly style: DrivingStyle;
      readonly utilization: number;
      readonly ghost: { readonly record: DriveRecord; readonly distance: number } | null;
    }
  | { readonly kind: 'run' };

/** A pass through a corner: its lap, lap station, least radius, steps, drifting steps and sideslips, and speeds. */
interface CornerPass {
  lap: number;
  from: number;
  to: number;
  leastRadius: number;
  steps: number;
  drift: number;
  sum: number;
  most: number;
  slowest: number;
  fastest: number;
}

interface DriveResult {
  readonly finished: boolean;
  readonly seconds: number;
  readonly s: number;
  readonly recoveries: number;
  readonly spins: number;
  readonly mostSideslip: number;
  readonly offSteps: number;
  readonly steps: number;
  readonly mostOff: number;
  readonly mostBeyondPath: number;
  readonly mostBeyondAt: string;
  readonly mostFromPath: number;
  readonly correction: { readonly least: number; readonly mean: number } | null;
  readonly leastGap: number | null;
  readonly corners: readonly CornerPass[];
  readonly record: DriveRecord;
}

const store = createNodeContentStore();
try {
  await main(process.argv.slice(2));
} catch (error) {
  reportError(error);
}

async function main(args: readonly string[]) {
  const opts = options(args, [
    '--course',
    '--vehicle',
    '--laps',
    '--utilization',
    '--route',
    '--style',
    '--ghost',
    '--ghost-distance',
  ]);
  requireInput(opts.has('--course') && opts.has('--vehicle'), '/arguments', USAGE);
  const content = requireCompiled(await compileContent(store, { measured: false }));
  const course = content.courses.find((candidate) => candidate.id === opts.get('--course'));
  requireInput(course, '/course', 'Unknown course');
  const entry = content.definitions.vehicles.find((e) => e.compiledVehicle.id === opts.get('--vehicle'));
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  const vehicle = createRunVehicle(entry, content.definitions.driving);
  const routes = enumerateCourseRoutes(course.entry, course.type);
  const routeIndex = Number(opts.get('--route') ?? 0);
  requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
  const lapCount = course.rules.maxLaps > 1 ? Number(opts.get('--laps') ?? 3) : 1;
  requireInput(
    Number.isInteger(lapCount) && lapCount >= 1 && lapCount <= course.rules.maxLaps,
    '/laps',
    'Laps must be a whole number within the course rules',
  );
  const utilization = Number(opts.get('--utilization') ?? 0.75);
  requireInput(utilization > 0 && utilization <= 1, '/utilization', 'Utilization must lie in (0,1]');
  const style = opts.get('--style') ?? 'drift';
  requireInput(style === 'drift' || style === 'grip', '/style', 'Style must be drift or grip');
  const lines = requireLoaded(
    readRacingLines(
      course,
      JSON.parse(new TextDecoder().decode(await store.read(`racing-lines/${course.id}.json`))) as unknown,
    ),
  );
  const catalog = { vehicles: content.definitions.vehicles, freePlay: content.freePlay };
  const route = routes[routeIndex]!;
  const drive = (how: Drive) => driveCourse(course, vehicle, catalog, route, lapCount, lines, how);
  const runs: { name: string; result: DriveResult }[] = [];
  let ghost: { record: DriveRecord; distance: number } | null = null;
  if (opts.has('--ghost')) {
    const ghostUtilization = Number(opts.get('--ghost'));
    requireInput(ghostUtilization > 0 && ghostUtilization <= 1, '/ghost', 'Ghost utilization must lie in (0,1]');
    const distance = Number(opts.get('--ghost-distance') ?? 25);
    requireInput(distance > 0, '/ghost-distance', 'Ghost distance must be positive');
    const recorded = drive({ kind: 'player', style: 'grip', utilization: ghostUtilization, ghost: null });
    runs.push({ name: `ghost: grip ${ghostUtilization}`, result: recorded });
    ghost = { record: recorded.record, distance };
  }
  const evaluated = drive({ kind: 'player', style, utilization, ghost });
  runs.push({ name: `${style} ${utilization}${ghost ? `, ghost ${ghost.distance} m ahead` : ''}`, result: evaluated });
  if (!ghost) runs.push({ name: 'run driver', result: drive({ kind: 'run' }) });
  console.log(
    `## ${course.id}, ${entry.compiledVehicle.id}, ${lapCount} lap${lapCount > 1 ? 's' : ''}, route ${routeIndex}\n`,
  );
  console.log(
    "| Drive | Time | Recoveries | Spins | Most sideslip | Off pavement | Most beyond the path's own | Most from the path " +
      '| Correction | Least gap ahead |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const { name, result } of runs) console.log(summaryRow(name, result));
  console.log(`\nCorners tighter than R ${CORNER_RADIUS} m of the evaluated drive:\n`);
  console.log('| Lap | From s | Least R (m) | Drifting | Mean | Most | Speed (km/h) |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const pass of evaluated.corners)
    console.log(
      `| ${pass.lap} | ${pass.from.toFixed(0)} | ${pass.leastRadius.toFixed(0)} | ${percent(pass.drift / pass.steps)} | ` +
        `${pass.drift ? `${(pass.sum / pass.drift).toFixed(0)}°` : '-'} | ${pass.most.toFixed(0)}° | ` +
        `${pass.slowest.toFixed(0)}–${pass.fastest.toFixed(0)} |`,
    );
}

/** One vehicle's drive of `lapCount` laps of `route` alone in FREE PLAY as `how` drives it: its measures and record. */
function driveCourse(
  course: CompiledCourse,
  runVehicle: RunVehicle,
  catalog: Catalog,
  route: ReturnType<typeof enumerateCourseRoutes>[number],
  lapCount: number,
  lines: Parameters<typeof referenceLine>[1],
  how: Drive,
): DriveResult {
  const scene = createCourseScene(course.entry, course.gates, catalog.vehicles);
  const configuration = compileRunConfiguration(
    {
      mode: 'FREE_PLAY',
      vehicleId: runVehicle.vehicleDefinition.compiledVehicle.id,
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
  // The race's drivers drive the course's racing lines, as in the game.
  const setup = resolveRunSetup(course, null, configuration, 0, runVehicle, null, { racingLines: lines });
  const { model, limits, speedCap } = setup.mechanicsOf(runVehicle);
  const driver =
    how.kind === 'player' ? compilePlannedDriver(model, limits, how.utilization, speedCap, true, how.style) : null;
  // The route's exit at each fork, which the run driver takes too, and its reference line.
  const planned = new Map(route.map((link) => [link.from.section, link]));
  const exit = (occurrence: RouteOccurrence) =>
    occurrence.section.fork!.exits.findIndex((candidate) => candidate.link === planned.get(occurrence.section));
  const lane = referenceLine(scene.runtime.route, lines, exit);
  // The driver drives the player by its own style's rule.
  const rule = how.kind === 'player' && how.style === 'drift' ? DRIFT_DRIVER.steering : REFERENCE_DRIVER.steering;
  const race = createCourseRace({ setup, runtime: scene.runtime, playerSteering: rule, playerExit: exit });
  const { vehicle } = race.player.actor;
  const workspace = createPlannedDriverWorkspace();
  const footprint = model.compiledVehicle.footprint;
  // The body's extent, its half width either side, beyond the outermost road edge at a route position.
  const offPavement = (s: number, l: number) => {
    const occurrence = scene.runtime.route.at(s);
    if (!occurrence) return 0;
    const roads = courseRoadsAt(occurrence.section.lanes, routeSectionS(occurrence, s));
    if (roads.length === 0) return 0;
    const left = Math.min(...roads.map((road) => road.left)) - occurrence.lateralOrigin;
    const right = Math.max(...roads.map((road) => road.right)) - occurrence.lateralOrigin;
    return Math.max(0, l + footprint / 2 - right, left - (l - footprint / 2));
  };
  // The path's heading at a station, and its curvature there over the corner chord.
  const a = createPlanCoordinateSample(),
    b = createPlanCoordinateSample();
  const pathHeading = (s: number) => {
    const p = scene.world.coordinates.toWorld(s, lane(s), a);
    const q = scene.world.coordinates.toWorld(s + 1, lane(s + 1), b);
    return Math.atan2(q.x - p.x, q.z - p.z);
  };
  const pathCurvature = (s: number) => {
    // Beyond either end of the loaded Route the path reads as straight.
    if (!scene.runtime.route.at(s - CORNER_CHORD / 2) || !scene.runtime.route.at(s + CORNER_CHORD / 2 + 1)) return 0;
    const turn = pathHeading(s + CORNER_CHORD / 2) - pathHeading(s - CORNER_CHORD / 2);
    return Math.atan2(Math.sin(turn), Math.cos(turn)) / CORNER_CHORD;
  };
  // A circuit's lap length, the sum of its Sections' lengths, by which a corner's station is told within its lap.
  let lapLength = Infinity;
  if (course.type === 'CIRCUIT') {
    lapLength = 0;
    let section = course.entry;
    do {
      lapLength += section.coordinates.domain.end;
      section = section.outgoing[0]!.to.section;
    } while (section !== course.entry);
  }
  // The ghost ahead: its record's station and speed at the race time, `distance` metres on.
  const ghostAt = (seconds: number): DriverLeader | null => {
    if (how.kind !== 'player' || how.ghost === null) return null;
    const { record, distance } = how.ghost;
    let i = 0;
    while (i + 1 < record.seconds.length && record.seconds[i + 1]! <= seconds) i++;
    return { s: record.s[i]! + distance, speed: record.speed[i]!, clearance: footprint, escape: 0 };
  };
  const record: DriveRecord = { seconds: [], s: [], speed: [] };
  const corners: CornerPass[] = [];
  let pass: CornerPass | null = null;
  let steps = 0,
    offSteps = 0,
    mostOff = 0,
    mostBeyondPath = 0,
    mostBeyondAt = '',
    mostFromPath = 0,
    mostSideslip = 0,
    spins = 0,
    spinning = false,
    onPath = false,
    leastCorrection = Infinity,
    corrections = 0,
    leastGap = Infinity;
  race.start();
  const ticks = Math.ceil((READY_SECONDS + LAP_SECONDS * lapCount) / SIM_DT);
  for (let tick = 0; tick < ticks; tick++) {
    if (race.outcome.status === 'READY') {
      race.advance(IDLE);
      continue;
    }
    const leader = ghostAt(race.clock.elapsedSeconds);
    if (driver === null) race.advance(null);
    else {
      const plan = planDriving(scene.world, vehicle, driver, lane, workspace, scene.runtime.window, leader, true);
      race.advance({ ...plannedDrivingInput(scene.world, vehicle, driver, lane, workspace, plan.target) });
      // A vehicle recovered to another place is driven on afresh.
      if (race.player.body.recovered) resetPlannedDriving(workspace);
      leastCorrection = Math.min(leastCorrection, workspace.correction);
      corrections += workspace.correction;
    }
    if (race.outcome.status === 'GOAL') break;
    steps++;
    const { s, l } = vehicle.course;
    const speed = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);
    record.seconds.push(race.clock.elapsedSeconds);
    record.s.push(s);
    record.speed.push(speed);
    // The sideslip: the angle between the body's heading and its velocity, up to 180° travelling backward.
    const sideslip =
      speed > SIDESLIP_SPEED ? Math.abs(Math.atan2(vehicle.lateralSpeed, vehicle.longitudinalSpeed)) / DEGREE : 0;
    mostSideslip = Math.max(mostSideslip, sideslip);
    if (sideslip > SPIN_ANGLE && !spinning) spins++;
    spinning = sideslip > SPIN_ANGLE;
    const off = offPavement(s, l);
    if (off > 0) offSteps++;
    mostOff = Math.max(mostOff, off);
    const beyond = off - offPavement(s, lane(s));
    if (beyond > mostBeyondPath) {
      mostBeyondPath = beyond;
      mostBeyondAt = `lap ${race.lap} s ${(s % lapLength).toFixed(0)}`;
    }
    const fromPath = Math.abs(l - lane(s));
    if (fromPath < ON_PATH) onPath = true;
    if (onPath) mostFromPath = Math.max(mostFromPath, fromPath);
    if (leader !== null) leastGap = Math.min(leastGap, leader.s - s - leader.clearance);
    const radius = 1 / Math.abs(pathCurvature(s));
    if (pass !== null && radius >= CORNER_RADIUS && s - pass.to >= CORNER_GAP) {
      corners.push(pass);
      pass = null;
    }
    if (radius < CORNER_RADIUS) {
      pass ??= {
        lap: race.lap,
        from: s % lapLength,
        to: s,
        leastRadius: Infinity,
        steps: 0,
        drift: 0,
        sum: 0,
        most: 0,
        slowest: Infinity,
        fastest: 0,
      };
      pass.to = s;
      pass.steps++;
      pass.leastRadius = Math.min(pass.leastRadius, radius);
      if (sideslip > DRIFT_ANGLE) {
        pass.drift++;
        pass.sum += sideslip;
      }
      pass.most = Math.max(pass.most, sideslip);
      pass.slowest = Math.min(pass.slowest, speed * 3.6);
      pass.fastest = Math.max(pass.fastest, speed * 3.6);
    }
  }
  if (pass !== null) corners.push(pass);
  return {
    finished: race.outcome.status === 'GOAL',
    seconds: race.clock.elapsedSeconds,
    s: vehicle.course.s,
    recoveries: race.player.actor.recovery.recoveries,
    spins,
    mostSideslip,
    offSteps,
    steps,
    mostOff,
    mostBeyondPath,
    mostBeyondAt,
    mostFromPath,
    correction: driver === null ? null : { least: leastCorrection, mean: corrections / Math.max(1, steps) },
    leastGap: Number.isFinite(leastGap) ? leastGap : null,
    corners,
    record,
  };
}

function percent(fraction: number) {
  return `${(100 * fraction).toFixed(0)} %`;
}

function summaryRow(name: string, r: DriveResult) {
  const time = r.finished ? `${r.seconds.toFixed(1)} s` : `not finished (s ${r.s.toFixed(0)})`;
  const off = r.offSteps ? `${((100 * r.offSteps) / r.steps).toFixed(1)} %, ${r.mostOff.toFixed(2)} m` : '0';
  const beyond = `${Math.max(0, r.mostBeyondPath).toFixed(2)} m${r.mostBeyondPath > 0 ? ` (${r.mostBeyondAt})` : ''}`;
  const correction = r.correction ? `${r.correction.least.toFixed(2)}–1, mean ${r.correction.mean.toFixed(2)}` : '-';
  const gap = r.leastGap === null ? '-' : `${r.leastGap.toFixed(1)} m`;
  return (
    `| ${name} | ${time} | ${r.recoveries} | ${r.spins} | ${r.mostSideslip.toFixed(0)}° | ${off} | ${beyond} | ` +
    `${r.mostFromPath.toFixed(1)} m | ${correction} | ${gap} |`
  );
}
