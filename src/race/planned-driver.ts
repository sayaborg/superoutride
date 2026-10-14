import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import type { SurfaceMapReader } from '../course/vehicle-world.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { openingForDriveTorque } from '../vehicle/physics/automatic-powertrain.js';
import type { VehicleDrivingRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DriverSteering } from '../vehicle/physics/vehicle-calibration.js';
import { fullSteeringYawRate } from '../vehicle/physics/vehicle-physics.js';
import { effectiveTireLoad } from '../vehicle/physics/tire-friction-calibration.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-state.js';
import { createSteeringRule, driverSteering } from '../vehicle/steering-rule.js';
import type { VehicleLimits } from '../vehicle/vehicle-limits.js';

/**
 * The planned driver's policy values ([Content and gameplay](../../docs/content-and-gameplay.md#drivers)). `version`
 * identifies the driver policy, these values and the driving law that reads them; it rises with any change that alters a
 * driver's input for the same state and observations ([Calibration](../../docs/calibration.md)).
 */
export const PLANNED_DRIVER = Object.freeze({
  version: 3,
  /**
   * Every planned driver's one steering rule, a driver's aid and not physics: the centre reference, full steering
   * input reaching the front tire's whole lateral force bound. It is independent of the driver's utilization, which
   * plans speed alone.
   */
  steering: createSteeringRule('center', 1),
  /** Metres: how far ahead the speed plan reaches, over cells of `spacing` metres. */
  lookahead: 480,
  spacing: 5,
  /** Seconds: the time in which the pedals close a speed error to the plan. */
  speedSeconds: 0.5,
  /**
   * The part of the lateral limit at the planned utilization the plan corners at; the steering rule's full input
   * reaches the front tire's whole bound (100 %), so the rest is left for closing the path-following error.
   */
  lateralMargin: 0.95,
  /** Seconds: how far ahead of the vehicle, at its speed, steering reads the path's curvature. */
  curvatureSeconds: 0.2,
  /** rad/s and ratio: the natural frequency and damping of the path-following error. */
  pathFrequency: 1.2,
  pathDamping: 0.8,
  /** Metres: the lateral error the path-following law reads at most, so a larger step is closed at a bounded rate. */
  pathErrorLimit: 2,
  /**
   * Off its path by more than `offPathMetres`, a driver plans the cells within `offPathSeconds` of its speed (at least
   * `offPathLeast` metres) on the lesser grip of its path's surface and the surface its offset puts it on.
   */
  offPathMetres: 1,
  offPathSeconds: 3,
  offPathLeast: 30,
  /** m/s: the least speed the path-following error's heading term and the steering inversion are read at. */
  minimumSteeringSpeed: 2,
  /** The least front load factor the steering inversion reads, which bounds it as the front tire unloads. */
  leastFrontLoadFactor: 0.25,
  /** Seconds of the driver's speed it plans to stop short of a terminal or behind the vehicle ahead, as a response. */
  responseSeconds: 0.45,
  /** Metres: the distance a driver leaves before a terminal, or behind the vehicle ahead, when it stops. */
  terminalClearance: 2,
  /** m/s: a planned speed within this of standstill is a stop. */
  speedDeadzone: 0.15,
  /** m/s: how much more speed another lane, or a passing offset, must allow before a driver that passes takes it. */
  passingMargin: 0.15,
  /** Metres: the steering path's least distance ahead, which holds at low speed. */
  minimumLookahead: 8,
  /** Metres: the least distance to a steering path's target. */
  minimumTargetDistance: 1,
  /** Metres: the least chord a cell's curvature divides its heading change by. */
  minimumCurvatureChord: 0.01,
  /** m/s: the least forward speed the travel direction is taken from. */
  travelYawMinimumSpeed: 0.1,
  /**
   * Seconds: the following time. A driver keeps the vehicle ahead in its lane this many seconds of that vehicle's speed
   * beyond its response distance, and a lane is free behind it to the rear vehicle's speed times this.
   */
  followSeconds: 1.5,
  /**
   * The capacity correction: its least value; the drop when either axle's tire utilization stays at 1 for longer than
   * `saturatedSeconds`; its recovery per second otherwise; and the step it is planned in.
   */
  correction: Object.freeze({
    least: 0.85,
    drop: 0.02,
    saturatedSeconds: 0.3,
    recovery: 0.01,
    resolution: 0.01,
    /** A tire utilization within this of 1 is at 1: the plateau's force fraction is 1 up to rounding. */
    saturation: 1e-6,
  }),
});

/**
 * A planned driver: its vehicle's model and limits, its utilization, speed cap, planning braking (the braking limit at
 * its utilization on level ground of unit grip, which other drivers' judgements read), whether it passes slower
 * vehicles (`passes`, by its path offsets; a driver that does not only follows them, though it still merges where its
 * lane ends), and the planned drivers' one steering rule (`PLANNED_DRIVER.steering`) on its vehicle. Its builder
 * decides the rest.
 */
export interface PlannedDriver {
  readonly model: VehicleModel;
  readonly limits: VehicleLimits;
  readonly utilization: number;
  readonly speedCap: number;
  readonly braking: number;
  readonly passes: boolean;
  readonly steering: Readonly<DriverSteering>;
}

const planningBraking = (limits: VehicleLimits, utilization: number) =>
  limits.brakeLimit(utilization, 1, 1, 0) / limits.inertia;

export function compilePlannedDriver(
  model: VehicleModel,
  limits: VehicleLimits,
  utilization: number,
  speedCap: number,
  passes: boolean,
): PlannedDriver {
  return Object.freeze({
    model,
    limits,
    utilization,
    speedCap,
    braking: planningBraking(limits, utilization),
    passes,
    steering: driverSteering(PLANNED_DRIVER.steering, model),
  });
}

/**
 * A driver whose owner changes its utilization and speed cap between steps; its planning braking follows the
 * utilization.
 */
export function createVariablePlannedDriver(
  model: VehicleModel,
  limits: VehicleLimits,
  utilization: number,
  speedCap: number,
  passes: boolean,
) {
  const driver = { ...compilePlannedDriver(model, limits, utilization, speedCap, passes) };
  return Object.freeze({
    driver: driver as PlannedDriver,
    set(nextUtilization: number, nextSpeedCap: number) {
      if (nextUtilization !== driver.utilization) {
        driver.utilization = nextUtilization;
        driver.braking = planningBraking(limits, nextUtilization);
      }
      driver.speedCap = nextSpeedCap;
    },
  });
}

/** A driver's path: a constant lateral or a lateral along the Route. */
type Lane = number | ((s: number) => number);
const lateralOf = (lane: Lane, s: number) => (typeof lane === 'number' ? lane : lane(s));

/**
 * The road a driver reads: its plan coordinates, height profile and the surface material at a route position, whose
 * grip factor and rolling resistance the plan reads (no material: no grip).
 */
export interface DriverRoad {
  readonly coordinates: PlanCoordinateReader;
  readonly height: ProfileReader;
  readonly surfaces: SurfaceMapReader;
}

/**
 * The vehicle ahead in the driver's lane: its route station, its speed (m/s), half the two lengths (m) and the least
 * footprint gap (m) the driver keeps behind it so that, at rest there, it can still steer around it into an adjacent
 * lane (`escape`; 0 when it would not).
 */
export interface DriverLeader {
  readonly s: number;
  readonly speed: number;
  readonly clearance: number;
  readonly escape: number;
}

/** A driver's planning domain: the resident Route and any terminal it plans to stop short of. */
export interface DrivingDomain {
  readonly start: number;
  readonly end: number;
  readonly terminal: number | null;
}

/** `domain` with the terminal at `terminal` when that comes first, written to `out`. */
export function drivingDomainBefore(
  domain: DrivingDomain,
  terminal: number,
  out: { start: number; end: number; terminal: number | null },
): DrivingDomain {
  out.start = domain.start;
  out.end = domain.end;
  out.terminal = Math.min(domain.terminal ?? Infinity, terminal);
  return out;
}

const CELLS = Math.ceil(PLANNED_DRIVER.lookahead / PLANNED_DRIVER.spacing) + 2;
const cells = () => new Float64Array(CELLS);

/**
 * A plan's cornering speeds, cached by cell: each depends on the cell's geometry and also on the limits, the planned
 * utilization, the speed cap (together its key) and the curvature and grip it reads. Plans of several utilizations over
 * one workspace's cells each keep their own.
 */
export function createPlannedCornering() {
  return {
    limits: null as VehicleLimits | null,
    planned: NaN,
    speedCap: NaN,
    key: 0,
    squared: cells(),
    curvatures: cells().fill(NaN),
    grips: cells().fill(NaN),
    keys: cells().fill(NaN),
  };
}
type Cornering = ReturnType<typeof createPlannedCornering>;

/** A driver's plan workspace: its cell cache, its cornering speeds, its passes, its correction and its input, all reused. */
export function createPlannedDriverWorkspace() {
  const nodes = () => new Float64Array(CELLS + 1);
  return {
    // A cell's geometry depends on the road, the path and its interval (its 5 m cell within the planning domain).
    road: null as DriverRoad | null,
    lane: null as Lane | null,
    cellStarts: cells().fill(NaN),
    cellEnds: cells().fill(NaN),
    /** The path's point, the road's heading and the profile's height at the cell's end, the chord's length, and the
     * cell's grade angle, vertical curvature, grip factor and rolling resistance. */
    x: cells(),
    z: cells(),
    y: cells(),
    headings: cells(),
    chords: cells(),
    roadCurvatures: cells(),
    lengths: cells(),
    grades: cells(),
    verticals: cells(),
    grips: cells(),
    rollings: cells(),
    /** The grip each cell is planned on: its own, or less while the vehicle is off its path. */
    planGrips: cells(),
    /**
     * Each cell's signed path curvature: on a smooth path its chord's heading change from the cell before over their
     * mean length; else the road's heading change along it over the chord, which a change of lane does not add to.
     */
    curvatures: cells(),
    cornering: createPlannedCornering(),
    /** The plan's nodes: the vehicle's station, then each planned cell's end; the cell index each segment crosses,
     * the path distance to it, whether it is crossed in flight, and the forward, free and constrained speeds squared. */
    count: 0,
    stations: nodes(),
    distances: nodes(),
    segmentCells: new Int32Array(CELLS + 1),
    flight: new Uint8Array(CELLS + 1),
    forward: nodes(),
    free: nodes(),
    constrained: nodes(),
    /** The capacity correction and how long either tire has stayed saturated. */
    correction: 1,
    saturated: 0,
    a: createPlanCoordinateSample(),
    b: createPlanCoordinateSample(),
    target: createPlanCoordinateSample(),
    differential: { y: 0, dYdS: 0 },
    pedals: { opening: 0, wheelTorquePerOpening: 0 },
    /** The latest plan: its speed now without the vehicle ahead (`free`) and with it (`target`), in m/s. */
    plan: { free: 0, target: 0 },
    input: { steering: 0, throttle: 0 as number | boolean, brake: 0 as number | boolean },
  };
}
type Workspace = ReturnType<typeof createPlannedDriverWorkspace>;

/**
 * Write the cells from the one holding station `s` through the lookahead, within `domain`: geometry where the cache
 * misses, then curvatures, the grips planned on and the plan's segments.
 */
function readCells(
  road: DriverRoad,
  s: number,
  speed: number,
  offset: number,
  lane: Lane,
  smooth: boolean,
  ws: Workspace,
  domain: DrivingDomain,
) {
  const { spacing } = PLANNED_DRIVER;
  const { coordinates, height, surfaces } = road;
  if (ws.road !== road || ws.lane !== lane) {
    ws.cellStarts.fill(NaN);
    ws.road = road;
    ws.lane = lane;
  }
  const first = Math.floor(s / spacing);
  const offPath = Math.abs(offset) > PLANNED_DRIVER.offPathMetres;
  const horizon = s + Math.max(PLANNED_DRIVER.offPathLeast, speed * PLANNED_DRIVER.offPathSeconds);
  let previousS = NaN,
    previousX = 0,
    previousZ = 0,
    previousHeading = 0,
    previousChord = NaN,
    previousLength = 0;
  let count = 0;
  // The cell before the vehicle's gives a smooth path's first chord.
  for (let cell = first - 1; cell < first + CELLS - 1; cell++) {
    const aS = Math.max(domain.start, cell * spacing);
    const bS = Math.min(domain.end, (cell + 1) * spacing);
    if (bS <= aS) {
      if (cell < first) continue;
      break;
    }
    const i = ((cell % CELLS) + CELLS) % CELLS;
    if (ws.cellStarts[i] !== aS || ws.cellEnds[i] !== bS) {
      if (aS !== previousS) {
        const a = coordinates.toWorld(aS, lateralOf(lane, aS), ws.a);
        previousX = a.x;
        previousZ = a.z;
        previousHeading = a.heading;
      }
      const lateral = lateralOf(lane, aS);
      const b = coordinates.toWorld(bS, lateralOf(lane, bS), ws.b);
      const dx = b.x - previousX,
        dz = b.z - previousZ;
      ws.x[i] = b.x;
      ws.z[i] = b.z;
      ws.lengths[i] = Math.hypot(dx, dz);
      ws.chords[i] = Math.atan2(dx, dz);
      // The road's heading change along the cell over the path's chord: the curvature of a path at a steady lateral,
      // which a change of lane does not add to.
      ws.headings[i] = b.heading;
      ws.roadCurvatures[i] =
        wrapAngle(b.heading - previousHeading) / Math.max(PLANNED_DRIVER.minimumCurvatureChord, ws.lengths[i]!);
      const slopeA = height.sampleDifferential(aS, ws.differential).dYdS,
        yA = ws.differential.y;
      const slopeB = height.sampleDifferential(bS, ws.differential).dYdS;
      ws.y[i] = ws.differential.y;
      const slope = (ws.y[i]! - yA) / (bS - aS);
      ws.grades[i] = Math.atan(slope);
      ws.verticals[i] = (slopeB - slopeA) / (bS - aS) / (1 + slope * slope) ** 1.5;
      const material = surfaces.sample(aS, lateral);
      ws.grips[i] = material?.gripFactor ?? 0;
      ws.rollings[i] = material?.rollingResistance ?? 0;
      ws.cellStarts[i] = aS;
      ws.cellEnds[i] = bS;
    }
    // A smooth path's own curvature: its chord's heading change from the cell before over their mean length.
    const curvature =
      smooth && !Number.isNaN(previousChord)
        ? wrapAngle(ws.chords[i]! - previousChord) /
          Math.max(PLANNED_DRIVER.minimumCurvatureChord, (ws.lengths[i]! + previousLength) / 2)
        : ws.roadCurvatures[i]!;
    ws.curvatures[i] = curvature;
    previousS = bS;
    previousX = ws.x[i]!;
    previousZ = ws.z[i]!;
    previousHeading = ws.headings[i]!;
    previousChord = ws.chords[i]!;
    previousLength = ws.lengths[i]!;
    if (cell < first) continue;
    let grip = ws.grips[i]!;
    if (offPath && aS < horizon)
      grip = Math.min(grip, surfaces.sample(aS, lateralOf(lane, aS) + offset)?.gripFactor ?? 0);
    ws.planGrips[i] = grip;
    // A segment from the previous node to this cell's end.
    count++;
    ws.segmentCells[count] = i;
    ws.stations[count] = bS;
    const from = count === 1 ? s : ws.stations[count - 1]!;
    ws.distances[count] = ws.distances[count - 1]! + ws.lengths[i]! * ((bS - from) / (bS - aS));
  }
  ws.stations[0] = s;
  ws.distances[0] = 0;
  ws.count = count;
}

/**
 * Write the cornering speeds of the cells read into `ws` for `driver` at `utilization` (its own, corrected), where
 * `cornering`'s cache misses.
 */
function readCornering(driver: PlannedDriver, planned: number, ws: Workspace, cornering: Cornering) {
  if (cornering.limits !== driver.limits || cornering.planned !== planned || cornering.speedCap !== driver.speedCap) {
    cornering.limits = driver.limits;
    cornering.planned = planned;
    cornering.speedCap = driver.speedCap;
    cornering.key++;
  }
  for (let j = 1; j <= ws.count; j++) {
    const i = ws.segmentCells[j]!,
      curvature = ws.curvatures[i]!,
      grip = ws.planGrips[i]!;
    if (cornering.keys[i] === cornering.key && cornering.curvatures[i] === curvature && cornering.grips[i] === grip)
      continue;
    const speed = driver.limits.corneringSpeed(
      curvature,
      ws.grades[i]!,
      ws.verticals[i]!,
      grip,
      ws.rollings[i]!,
      planned * PLANNED_DRIVER.lateralMargin,
    );
    cornering.squared[i] = Math.min(driver.speedCap, speed) ** 2;
    cornering.keys[i] = cornering.key;
    cornering.curvatures[i] = curvature;
    cornering.grips[i] = grip;
  }
}

/** m/s²: the cell's load factor at speed `v`. */
const loadFactor = (ws: Workspace, i: number, v: number) =>
  Math.cos(ws.grades[i]!) + (v * v * ws.verticals[i]!) / VEHICLE_GRAVITY;

/** m/s²: the most the vehicle accelerates (`drive`) or decelerates in cell `i` at speed `v` at utilization `u`. */
function cellAcceleration(limits: VehicleLimits, ws: Workspace, i: number, v: number, u: number, drive: boolean) {
  const n = loadFactor(ws, i, v),
    grip = ws.planGrips[i]!;
  const lateral = v * v * Math.abs(ws.curvatures[i]!);
  const resistance = limits.drag(v) + VEHICLE_GRAVITY * (Math.sin(ws.grades[i]!) + ws.rollings[i]! * Math.max(0, n));
  if (!(n > 0)) return (drive ? -resistance : resistance) / limits.inertia;
  const cornering = limits.corneringDrag(lateral, n, grip);
  // The axles keep the lateral margin while they drive or brake, as in a corner.
  const reserved = lateral / PLANNED_DRIVER.lateralMargin;
  return drive
    ? (limits.driveLimit(v, u, grip, n, reserved) - resistance - cornering) / limits.inertia
    : (limits.brakeLimit(u, grip, n, reserved) + resistance + cornering) / limits.inertia;
}

/**
 * The forward pass from speed `speed` at the vehicle's station: each node the faster of nothing and the previous node's
 * speed driven over the segment, within the cell's cornering speed. Where the load factor reaches 0 the vehicle takes
 * off, and the profile is traced under its ballistic flight to its landing: the segments crossed in flight carry speed.
 */
function forwardPass(limits: VehicleLimits, ws: Workspace, cornering: Cornering, speed: number, u: number) {
  ws.forward[0] = speed * speed;
  let flightFrom = -1,
    takeOffS = 0,
    takeOffY = 0,
    horizontal = 0,
    vertical = 0;
  for (let j = 1; j <= ws.count; j++) {
    const i = ws.segmentCells[j]!;
    const v = Math.sqrt(ws.forward[j - 1]!);
    if (flightFrom < 0 && !(loadFactor(ws, i, v) > 0)) {
      flightFrom = j - 1;
      takeOffS = ws.stations[j - 1]!;
      takeOffY =
        j === 1 ? ws.y[i]! - Math.tan(ws.grades[i]!) * (ws.stations[1]! - takeOffS) : ws.y[ws.segmentCells[j - 1]!]!;
      horizontal = Math.max(v * Math.cos(ws.grades[i]!), PLANNED_DRIVER.minimumSteeringSpeed);
      vertical = v * Math.sin(ws.grades[i]!);
    }
    if (flightFrom >= 0) {
      ws.flight[j] = 1;
      ws.forward[j] = ws.forward[j - 1]!;
      const t = (ws.stations[j]! - takeOffS) / horizontal;
      if (takeOffY + vertical * t - (VEHICLE_GRAVITY * t * t) / 2 <= ws.y[i]!) flightFrom = -1;
      continue;
    }
    ws.flight[j] = 0;
    const a = cellAcceleration(limits, ws, i, v, u, true);
    const segment = ws.distances[j]! - ws.distances[j - 1]!;
    ws.forward[j] = Math.max(0, Math.min(cornering.squared[i]!, ws.forward[j - 1]! + 2 * segment * a));
  }
}

/** The speed² at segment start `from` that brakes to speed² `end` at station `stop` within the segment to `to`. */
function endWithin(
  limits: VehicleLimits,
  ws: Workspace,
  i: number,
  u: number,
  segment: number,
  from: number,
  to: number,
  stop: number,
  end: number,
) {
  return end + 2 * ((stop - from) / (to - from)) * segment * cellAcceleration(limits, ws, i, Math.sqrt(end), u, false);
}

/**
 * The backward pass into `out` from the plan's end constraints: at or beyond station `stopA` at most speed² `endA`,
 * at or beyond `stopB` at most `endB` (Infinity for none), braked back over each segment within the forward speeds;
 * a segment crossed in flight carries speed back to its take-off. Returns the speed the plan allows now: the backward
 * bound at the vehicle's station, which its own speed does not limit.
 */
function backwardPass(
  limits: VehicleLimits,
  ws: Workspace,
  u: number,
  out: Float64Array,
  stopA: number,
  endA: number,
  stopB: number,
  endB: number,
) {
  const bound = (j: number, value: number) => {
    let v2 = value;
    if (ws.stations[j]! >= stopA) v2 = Math.min(v2, endA);
    if (ws.stations[j]! >= stopB) v2 = Math.min(v2, endB);
    return v2;
  };
  const n = ws.count;
  out[n] = bound(n, ws.forward[n]!);
  let allowed = out[0]!;
  for (let j = n; j >= 1; j--) {
    const i = ws.segmentCells[j]!;
    let v2: number;
    if (ws.flight[j]) v2 = out[j]!;
    else if (
      j > 1 &&
      ws.forward[j - 1]! <= out[j]! &&
      limits.drag(Math.sqrt(out[j]!)) + VEHICLE_GRAVITY * Math.sin(ws.grades[i]!) >= 0
    )
      // Braking only raises the speed back from here, and the forward speed is no more: it holds.
      v2 = out[j]!;
    else {
      const segment = ws.distances[j]! - ws.distances[j - 1]!;
      // A segment where even braking speeds the vehicle up allows no more than standstill at its start.
      v2 = Math.max(0, out[j]! + 2 * segment * cellAcceleration(limits, ws, i, Math.sqrt(out[j]!), u, false));
      // An end inside the segment brakes from its own station.
      const from = ws.stations[j - 1]!,
        to = ws.stations[j]!;
      if (stopA > from && stopA < to) v2 = Math.min(v2, endWithin(limits, ws, i, u, segment, from, to, stopA, endA));
      if (stopB > from && stopB < to) v2 = Math.min(v2, endWithin(limits, ws, i, u, segment, from, to, stopB, endB));
    }
    if (j === 1) allowed = bound(0, v2);
    out[j - 1] = bound(j - 1, Math.min(ws.forward[j - 1]!, v2));
  }
  return Math.sqrt(allowed);
}

/** Follow the tires' saturation: the correction drops while either axle's tire stays at its limit, else recovers. */
function correct(car: VehicleDrivingRead, ws: Workspace, seconds: number) {
  const { least, drop, saturatedSeconds, recovery, saturation } = PLANNED_DRIVER.correction;
  if (Math.max(car.tires.front.utilization, car.tires.rear.utilization) >= 1 - saturation) {
    ws.saturated += seconds;
    if (ws.saturated > saturatedSeconds) {
      ws.correction = Math.max(least, ws.correction - drop);
      ws.saturated = 0;
    }
  } else {
    ws.saturated = 0;
    ws.correction = Math.min(1, ws.correction + recovery * seconds);
  }
}

/**
 * The speed plan at station `s` moving at `speed` along `lane` within `domain`: the forward pass, then the backward pass
 * from the terminal (free) and also from the vehicle ahead (target). Writes the plan's speeds now.
 */
function plan(
  road: DriverRoad,
  s: number,
  speed: number,
  driver: PlannedDriver,
  lane: Lane,
  ws: Workspace,
  domain: DrivingDomain,
  leader: DriverLeader | null,
  offset: number,
  smooth: boolean,
) {
  const { limits } = driver;
  readCells(road, s, speed, offset, lane, smooth, ws, domain);
  const { resolution } = PLANNED_DRIVER.correction;
  const u = driver.utilization * Math.round(ws.correction / resolution) * resolution;
  readCornering(driver, u, ws, ws.cornering);
  forwardPass(limits, ws, ws.cornering, speed, u);
  const { terminalClearance, responseSeconds, followSeconds } = PLANNED_DRIVER;
  const response = speed * responseSeconds;
  const terminal = domain.terminal === null ? Infinity : domain.terminal - terminalClearance - response;
  ws.plan.free = backwardPass(limits, ws, u, ws.free, terminal, 0, Infinity, Infinity);
  if (leader === null) {
    ws.constrained.set(ws.free);
    ws.plan.target = ws.plan.free;
  } else {
    // A vehicle ahead moving backward along the Route is planned for as a stopped one.
    const ahead = Math.max(0, leader.speed);
    const gap = Math.max(terminalClearance + ahead * followSeconds, leader.escape);
    const stop = leader.s - leader.clearance - gap - response;
    ws.plan.target = backwardPass(limits, ws, u, ws.constrained, terminal, 0, stop, ahead * ahead);
  }
  return ws.plan;
}

/**
 * The driver's plan now, at the vehicle's station and speed along `lane`, behind `leader` when one is given: its speed
 * now without and with the vehicle ahead (borrowed from the workspace). It first follows the tires' saturation. A
 * `smooth` path (the racing line) is planned on its own curvature, any other on the road's at its lateral.
 */
export function planDriving(
  road: DriverRoad,
  car: VehicleDrivingRead,
  driver: PlannedDriver,
  lane: Lane,
  ws: Workspace,
  domain: DrivingDomain,
  leader: DriverLeader | null,
  smooth = false,
): { readonly free: number; readonly target: number } {
  correct(car, ws, driver.model.step);
  const { s, l } = car.course;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  return plan(road, s, speed, driver, lane, ws, domain, leader, l - lateralOf(lane, s), smooth);
}

/**
 * Read the road ahead of the vehicle along `lane` within `domain` into `ws`, for plans from its station and speed
 * without a vehicle ahead or a capacity correction (`plannedSpeedAhead`), which share these cells.
 */
export function readRoadAhead(
  road: DriverRoad,
  car: VehicleDrivingRead,
  lane: Lane,
  ws: Workspace,
  domain: DrivingDomain,
): void {
  const { s, l } = car.course;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  readCells(road, s, speed, l - lateralOf(lane, s), lane, false, ws, domain);
}

/**
 * The speed `driver`'s plan over the road last read into `ws` (`readRoadAhead`) allows `distance` metres ahead of the
 * vehicle moving at `speed` (within the planned cells; beyond them, at the last node), its cornering speeds cached in
 * `cornering`.
 */
export function plannedSpeedAhead(
  driver: PlannedDriver,
  ws: Workspace,
  cornering: Cornering,
  domain: DrivingDomain,
  speed: number,
  distance: number,
): number {
  readCornering(driver, driver.utilization, ws, cornering);
  forwardPass(driver.limits, ws, cornering, speed, driver.utilization);
  const { terminalClearance, responseSeconds } = PLANNED_DRIVER;
  const terminal = domain.terminal === null ? Infinity : domain.terminal - terminalClearance - speed * responseSeconds;
  backwardPass(driver.limits, ws, driver.utilization, ws.free, terminal, 0, Infinity, Infinity);
  const at = ws.stations[0]! + distance;
  for (let j = 1; j <= ws.count; j++)
    if (ws.stations[j]! >= at) {
      const a = ws.stations[j - 1]!,
        t = (at - a) / (ws.stations[j]! - a);
      return Math.sqrt(ws.free[j - 1]! + t * (ws.free[j]! - ws.free[j - 1]!));
    }
  return Math.sqrt(ws.free[ws.count]!);
}

/**
 * The first node of the driver's plan from route station `s` moving at `speed` along `lane` within `domain`, without a
 * vehicle ahead: its station, the path length to it and the speed the plan allows there, written to `out`; null where
 * the plan has no node ahead. A `smooth` path is planned on its own curvature. Stepping from node to node at the
 * speeds it allows drives the plan's own speed profile, which times a path without the vehicle's dynamics.
 */
export function plannedNode(
  road: DriverRoad,
  s: number,
  speed: number,
  driver: PlannedDriver,
  lane: Lane,
  ws: Workspace,
  domain: DrivingDomain,
  smooth: boolean,
  out: { s: number; distance: number; speed: number },
): { s: number; distance: number; speed: number } | null {
  plan(road, s, speed, driver, lane, ws, domain, null, 0, smooth);
  if (ws.count === 0) return null;
  out.s = ws.stations[1]!;
  out.distance = ws.distances[1]!;
  out.speed = Math.sqrt(ws.free[1]!);
  return out;
}

/**
 * The driver's planned speed at route station `s` along `lane`, behind `leader` when one is given: its plan from its
 * speed cap, which no faster speed changes.
 */
export function plannedSpeed(
  road: DriverRoad,
  s: number,
  driver: PlannedDriver,
  lane: Lane,
  domain: DrivingDomain,
  leader: DriverLeader | null = null,
  smooth = false,
): number {
  const ws = createPlannedDriverWorkspace();
  return plan(road, s, driver.speedCap, driver, lane, ws, domain, leader, 0, smooth).target;
}

/**
 * The square of the speed a driver at station `s` moving at `speed` with planning braking `braking` may plan behind
 * `leader`: reached at its speed with a footprint gap kept beyond the response distance — the terminal clearance plus
 * the following gap, or the leader's escape gap when that is more — as from planning braking over the rest.
 */
function leaderBoundSquared(s: number, speed: number, braking: number, leader: DriverLeader): number {
  const ahead = Math.max(0, leader.speed);
  const gap = Math.max(PLANNED_DRIVER.terminalClearance + ahead * PLANNED_DRIVER.followSeconds, leader.escape);
  const margin = Math.max(0, leader.s - s - leader.clearance - gap - speed * PLANNED_DRIVER.responseSeconds);
  return ahead ** 2 + 2 * braking * margin;
}

/**
 * Whether a driver at station `s` moving at route speed `speed` with planning braking `braking` can stop for `leader`
 * ahead; one moving backward can.
 */
export function canFollow(s: number, speed: number, braking: number, leader: DriverLeader): boolean {
  return speed <= 0 || speed ** 2 <= leaderBoundSquared(s, speed, braking, leader);
}

/**
 * The speed the driver's current plan would allow in a lane whose vehicle ahead is `leader`: the plan without a vehicle
 * ahead (`free`), behind that lane's leader at its planning braking. Adjacent lanes differ little in the rest.
 */
export function speedBehind(
  car: VehicleDrivingRead,
  driver: PlannedDriver,
  free: number,
  leader: DriverLeader | null,
): number {
  if (leader === null) return free;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  return Math.sqrt(Math.min(free ** 2, leaderBoundSquared(car.course.s, speed, driver.braking, leader)));
}

/**
 * A vehicle's route speed (m/s): its velocity along the road's tangent at its route position, whose heading is
 * `roadHeading`; negative while it moves backward along the Route. Drivers see other vehicles' speeds as this.
 */
export function routeSpeed(car: VehicleDrivingRead, roadHeading: number): number {
  return car.velocityX * Math.sin(roadHeading) + car.velocityZ * Math.cos(roadHeading);
}

/** The direction a vehicle travels in (rad, as yaw): its yaw turned by its slip, read at a least forward speed. */
export function travelYaw(car: VehicleDrivingRead): number {
  return car.yaw + Math.atan2(car.lateralSpeed, Math.max(PLANNED_DRIVER.travelYawMinimumSpeed, car.longitudinalSpeed));
}

/** A planned driver's pedals and steering, written in place. */
export function createPlannedInput() {
  return { steering: 0, throttle: 0 as number | boolean, brake: 0 as number | boolean };
}

/**
 * The one pedal that asks `acceleration` (m/s² along the travel direction) of `model`'s vehicle against the resistance
 * `resistance` (m/s²: grade, rolling and cornering resistance) and its drag: the throttle by inverting the affine
 * opening-to-torque map at its gear and engine speed, else the brake as a part of the full brake force. Written to
 * `input`.
 */
export function plannedPedals(
  model: VehicleModel,
  limits: VehicleLimits,
  car: VehicleDrivingRead,
  acceleration: number,
  resistance: number,
  input: ReturnType<typeof createPlannedInput>,
  scratch = { opening: 0, wheelTorquePerOpening: 0 },
) {
  const { compiledVehicle } = model;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const force = limits.mass * (acceleration + resistance + limits.drag(speed));
  const front = compiledVehicle.frontDriveTorqueFraction;
  const wheelPerTorque =
    front / compiledVehicle.frontStation.rollingRadius + (1 - front) / compiledVehicle.rearStation.rollingRadius;
  const { opening, wheelTorquePerOpening } = openingForDriveTorque(
    compiledVehicle.powertrain,
    model.powertrain,
    car.powertrain,
    force / wheelPerTorque,
    scratch,
  );
  if (opening >= 0) {
    input.throttle = Math.min(1, opening);
    input.brake = 0;
  } else {
    input.throttle = 0;
    input.brake = clamp((-opening * wheelTorquePerOpening * wheelPerTorque) / (limits.brake * limits.mass), 0, 1);
  }
  return input;
}

/**
 * The steering input that asks the yaw rate of a path of signed curvature `curvature` (1/m, positive to the right) with
 * the path-following error closed: `lateralError` (m, positive right of the path) and `headingError` (rad, the travel
 * direction's, positive right of the path's). The yaw rate is inverted through the steering rule's full-input yaw rate
 * on a front surface of `grip`.
 */
export function plannedSteering(
  model: VehicleModel,
  steering: DriverSteering,
  car: VehicleDrivingRead,
  grip: number,
  curvature: number,
  lateralError: number,
  headingError: number,
): number {
  if (car.longitudinalSpeed <= 0) return 0;
  const speed = Math.max(PLANNED_DRIVER.minimumSteeringSpeed, Math.hypot(car.longitudinalSpeed, car.lateralSpeed));
  const { pathFrequency: w, pathDamping: z, pathErrorLimit } = PLANNED_DRIVER;
  const error = clamp(lateralError, -pathErrorLimit, pathErrorLimit);
  const lateral = speed * speed * curvature - w * w * error - 2 * z * w * speed * Math.sin(headingError);
  // The input sets the front tire's slip, so the force it asks follows the front axle's effective load: the full input's
  // yaw rate scales with the front load factor the tire law reads.
  const { staticLoad } = model.compiledVehicle.frontStation.suspension;
  const front = Math.max(
    PLANNED_DRIVER.leastFrontLoadFactor,
    effectiveTireLoad(model.tire, car.tires.front.load, staticLoad) / staticLoad,
  );
  const full = front * fullSteeringYawRate(model, steering, grip, car.longitudinalSpeed, car.lateralSpeed);
  return clamp(lateral / speed / full, -1, 1);
}

/** The index of the plan's segment holding the station `ahead` metres along the path from the vehicle. */
function segmentAt(ws: Workspace, ahead: number) {
  let j = 1;
  while (j < ws.count && ws.distances[j]! < ahead) j++;
  return j;
}

/**
 * The driver's input along `lane` at its latest plan in `ws`, `target` its speed now: the pedals ask the plan's
 * acceleration to the node a cell ahead, closing the speed error to the plan; the steering follows the path, reading its
 * curvature a moment ahead, neutral in flight. A plan within the deadzone of standstill is a stop: the brake holds.
 */
export function plannedDrivingInput(
  road: DriverRoad,
  car: VehicleDrivingRead,
  driver: PlannedDriver,
  lane: Lane,
  ws: Workspace,
  target: number,
): DrivingInput {
  const { model, limits } = driver;
  const input = ws.input;
  const s = car.course.s;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  // A target above the constrained plan (a lane the driver moved to) follows the free plan.
  const speeds = target > ws.plan.target ? ws.free : ws.constrained;
  if (ws.count === 0 || target < PLANNED_DRIVER.speedDeadzone) {
    input.throttle = 0;
    input.brake = 1;
  } else {
    const j = segmentAt(ws, PLANNED_DRIVER.spacing / 2);
    const i = ws.segmentCells[1]!;
    const n = loadFactor(ws, i, speed);
    const lateral = speed * speed * Math.abs(ws.curvatures[i]!);
    const acceleration =
      (speeds[j]! - speed * speed) / (2 * Math.max(PLANNED_DRIVER.spacing / 2, ws.distances[j]!)) +
      (target - speed) / PLANNED_DRIVER.speedSeconds;
    const resistance =
      VEHICLE_GRAVITY * (Math.sin(ws.grades[i]!) + ws.rollings[i]! * Math.max(0, n)) +
      (n > 0 ? limits.corneringDrag(lateral, n, ws.planGrips[i]!) : 0);
    plannedPedals(model, limits, car, acceleration * limits.inertia, resistance, input, ws.pedals);
  }
  if (car.tires.front.load === 0 && car.tires.rear.load === 0) input.steering = 0;
  else {
    const here = road.coordinates.toWorld(s, lateralOf(lane, s), ws.a);
    const [x, z] = [here.x, here.z];
    const next = road.coordinates.toWorld(s + 1, lateralOf(lane, s + 1), ws.b);
    const heading = Math.atan2(next.x - x, next.z - z);
    const curvature =
      ws.count === 0 ? 0 : ws.curvatures[ws.segmentCells[segmentAt(ws, speed * PLANNED_DRIVER.curvatureSeconds)]!]!;
    const grip = road.surfaces.sample(s, car.course.l)?.gripFactor ?? 1;
    input.steering = plannedSteering(
      model,
      driver.steering,
      car,
      grip,
      curvature,
      car.course.l - lateralOf(lane, s),
      wrapAngle(travelYaw(car) - heading),
    );
  }
  return input;
}

/** The driver's input, planning alone: no vehicle ahead constrains it (reference runs and scenario policies). */
export function samplePlannedDrivingInput(
  road: DriverRoad,
  car: VehicleDrivingRead,
  driver: PlannedDriver,
  lane: Lane,
  ws: Workspace,
  domain: DrivingDomain,
  smooth = false,
): DrivingInput {
  const { target } = planDriving(road, car, driver, lane, ws, domain, null, smooth);
  return plannedDrivingInput(road, car, driver, lane, ws, target);
}

/** Steps of a traced steering path per steering lookahead, and the lookaheads it is traced over. */
const STEERING_PATH_STEPS = 16;
const STEERING_PATH_LOOKAHEADS = 4;

/** A traced steering path: forward distances along the road and the laterals reached there. */
export function createSteeringPath() {
  const samples = STEERING_PATH_STEPS * STEERING_PATH_LOOKAHEADS + 1;
  return { count: 0, distances: new Float64Array(samples), laterals: new Float64Array(samples) };
}

/**
 * The path a driver's steering takes into a lane from route station `s` and lateral `l`, travelling at `heading` (rad)
 * to the road, toward the lateral `target` gives its steering `lookahead` ahead: traced kinematically in the road's
 * frame as a pursuit, as on a straight road, over four lookaheads, in which the steering settles. Written to `path`.
 */
export function traceSteeringPath(
  path: ReturnType<typeof createSteeringPath>,
  s: number,
  l: number,
  heading: number,
  lookahead: number,
  target: (s: number) => number,
): ReturnType<typeof createSteeringPath> {
  const step = lookahead / STEERING_PATH_STEPS;
  let x = 0;
  path.distances[0] = 0;
  path.laterals[0] = l;
  for (let i = 1; i < path.distances.length; i++) {
    const toward = target(s + x + lookahead) - l;
    const curvature =
      (2 * Math.sin(Math.atan2(toward, lookahead) - heading)) /
      Math.max(PLANNED_DRIVER.minimumTargetDistance, Math.hypot(lookahead, toward));
    x += step * Math.cos(heading);
    l += step * Math.sin(heading);
    heading += curvature * step;
    path.distances[i] = x;
    path.laterals[i] = l;
  }
  path.count = path.distances.length;
  return path;
}

/** The lateral a traced steering path reaches `x` metres ahead, or null beyond the traced distance. */
export function steeringPathLateral(path: ReturnType<typeof createSteeringPath>, x: number): number | null {
  if (x <= 0) return path.laterals[0]!;
  for (let i = 1; i < path.count; i++)
    if (path.distances[i]! >= x) {
      const a = path.distances[i - 1]!;
      return path.laterals[i - 1]! + ((path.laterals[i]! - path.laterals[i - 1]!) * (x - a)) / (path.distances[i]! - a);
    }
  return null;
}

/** The farthest distance (m) along the road a steering path traced at `speed` (m/s) reaches: four lookaheads. */
export function steeringPathReach(speed: number): number {
  return STEERING_PATH_LOOKAHEADS * steeringLookahead(speed);
}

/**
 * How far ahead (m) a driver moving at `speed` (m/s) traces its steering path for: its response distance, at least
 * `minimumLookahead` and at most the plan's lookahead.
 */
export function steeringLookahead(speed: number): number {
  return Math.min(
    PLANNED_DRIVER.lookahead,
    Math.max(PLANNED_DRIVER.minimumLookahead, speed * PLANNED_DRIVER.responseSeconds),
  );
}
