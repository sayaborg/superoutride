import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleMotionRead } from '../vehicle/physics/vehicle-contract.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import type { SurfaceMapReader } from '../course/vehicle-world.js';

// Inverse metres: curvature resolution floor (radius 10,000 km); suppresses heading
// differencing noise. At 100 m/s the omitted lateral demand is at most 0.001 m/s^2.
const MIN_DRIVER_CURVATURE_PER_METER = 1e-7;

/**
 * Input/planning policy only. The measured envelope and production mechanics retain their own authority. `version`
 * identifies the driver policy, these values and the driving law that reads them; it rises with any change that alters a
 * driver's input for the same state and observations ([Calibration](../../docs/calibration.md)).
 */
export const ENVELOPE_DRIVER = Object.freeze({
  version: 14,
  lookahead: 480,
  spacing: 5,
  responseSeconds: 0.45,
  /** Metres: the distance a driver leaves before a terminal, or behind the vehicle ahead, when it stops. */
  terminalClearance: 2,
  /** m/s: the pedal deadzone around the target speed; a target within it of standstill is a stop. */
  speedDeadzone: 0.15,
  /** m/s: how much more speed another lane must allow before a driver that passes moves to it. */
  passingMargin: 0.15,
  /** Metres: the steering target's least distance ahead, which holds at low speed. */
  minimumLookahead: 8,
  /** Metres: the least chord a curvature cell divides its heading change by. */
  minimumCurvatureChord: 0.01,
  /** Fixed-point iterations of a cell's curve speed, whose lateral limit depends on the speed itself. */
  curveSpeedIterations: 4,
  /** Fixed-point iterations of the planned speed at a station, and their tolerance in m/s. */
  plannedSpeedIterations: 16,
  plannedSpeedTolerance: 1e-6,
  /** m/s: the least forward speed the travel direction is taken from. */
  travelYawMinimumSpeed: 0.1,
  /** Metres: the least distance to the steering target. */
  minimumTargetDistance: 1,
  /** m/s: the least speed whose square scales the pursuit's lateral demand. */
  steeringDemandMinimumSpeed: 5,
  /** m/s: the least speed the steering gain is read at. */
  steeringGainMinimumSpeed: 5,
  /**
   * Seconds: the following time. A driver keeps the vehicle ahead in its lane this many seconds of that vehicle's speed
   * beyond its response distance, and a lane is free behind it to the rear vehicle's speed times this.
   */
  followSeconds: 1.5,
});

export function envelopeAt(
  envelope: RivalEnvelope,
  speed: number,
  out: ReturnType<typeof createEnvelopeDriverWorkspace>['row'],
) {
  const rows = envelope.rows;
  let i = 1;
  while (i < rows.length && rows[i]!.speed < speed) i++;
  const a = rows[Math.max(0, i - 1)]!,
    b = rows[Math.min(i, rows.length - 1)]!;
  const f = a === b ? 0 : clamp((speed - a.speed) / (b.speed - a.speed), 0, 1);
  out.acceleration = a.acceleration + f * (b.acceleration - a.acceleration);
  out.braking = a.braking + f * (b.braking - a.braking);
  out.lateral = a.lateral + f * (b.lateral - a.lateral);
  out.steeringGain = a.steeringGain + f * (b.steeringGain - a.steeringGain);
  return out;
}

const minimumBraking = (envelope: RivalEnvelope) => Math.min(...envelope.rows.map((row) => row.braking));

/**
 * A driver: its envelope, utilization, speed cap (within the envelope's maximum speed), planning braking, and whether it
 * changes lanes to pass slower vehicles (`passes`; a driver that does not only follows them, though it still merges where
 * its lane ends). Its builder decides each.
 */
export function compileEnvelopeDriver(envelope: RivalEnvelope, utilization: number, speedCap: number, passes: boolean) {
  return Object.freeze({
    envelope,
    utilization,
    speedCap: Math.min(speedCap, envelope.maximumSpeed),
    braking: minimumBraking(envelope) * utilization,
    passes,
  });
}
export type EnvelopeDriver = ReturnType<typeof compileEnvelopeDriver>;
type Driver = EnvelopeDriver;

/**
 * A driver whose owner changes its utilization and speed cap between steps; its planning braking follows the
 * utilization, and its speed cap stays within the envelope's maximum speed.
 */
export function createVariableEnvelopeDriver(
  envelope: RivalEnvelope,
  utilization: number,
  speedCap: number,
  passes: boolean,
) {
  const braking = minimumBraking(envelope);
  const driver = { ...compileEnvelopeDriver(envelope, utilization, speedCap, passes) };
  return Object.freeze({
    driver: driver as Driver,
    set(nextUtilization: number, nextSpeedCap: number) {
      driver.utilization = nextUtilization;
      driver.braking = braking * nextUtilization;
      driver.speedCap = Math.min(nextSpeedCap, envelope.maximumSpeed);
    },
  });
}
type Lane = number | ((s: number) => number);

/**
 * The road a driver reads: its plan coordinates and the surface material at a route position, whose grip factor scales
 * what the driver plans for there (no material: no grip).
 */
export interface DriverRoad {
  readonly coordinates: PlanCoordinateReader;
  readonly surfaces: SurfaceMapReader;
}
const gripAt = (road: DriverRoad, s: number, l: number) => road.surfaces.sample(s, l)?.gripFactor ?? 0;

/**
 * The vehicle ahead in the driver's lane: its route station, its speed (m/s), half the two lengths (m) and the least
 * footprint gap (m) the driver keeps behind it so that, at rest there, it can still steer around it into an adjacent
 * lane (`escape`; 0 when it would not).
 */
export interface EnvelopeLeader {
  readonly s: number;
  readonly speed: number;
  readonly clearance: number;
  readonly escape: number;
}
const CACHE_SIZE = Math.ceil(ENVELOPE_DRIVER.lookahead / ENVELOPE_DRIVER.spacing) + 1;

export function createEnvelopeDriverWorkspace() {
  return {
    // A cell's curvature and grip depend on the road, the lane and its interval (its 5 m cell within the planning
    // domain); its curve speed also on the envelope, utilization and speed cap.
    road: null as DriverRoad | null,
    lane: null as Lane | null,
    envelope: null as RivalEnvelope | null,
    utilization: NaN,
    speedCap: NaN,
    /** Each cached cell's interval: a cell clipped by the domain is cached apart from the whole cell. */
    cellStarts: new Float64Array(CACHE_SIZE).fill(NaN),
    cellEnds: new Float64Array(CACHE_SIZE).fill(NaN),
    curvatures: new Float64Array(CACHE_SIZE),
    grips: new Float64Array(CACHE_SIZE),
    /** The latest plan's least grip from its first cell through each cell, in plan order, and that first cell. */
    leastGrips: new Float64Array(CACHE_SIZE),
    leastGripCount: 0,
    leastGripFirst: 0,
    speedCells: new Float64Array(CACHE_SIZE).fill(NaN),
    speedsSquared: new Float64Array(CACHE_SIZE),
    a: createPlanCoordinateSample(),
    b: createPlanCoordinateSample(),
    target: createPlanCoordinateSample(),
    row: { acceleration: 0, braking: 0, lateral: 0, steeringGain: 0 },
    /** The latest plan: its target speed without the vehicle ahead (`free`) and with it (`target`), in m/s. */
    plan: { free: 0, target: 0 },
    input: { steering: 0, throttle: false, brake: false },
  };
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

/**
 * The planned speed at route station `s` when moving at `speed`: curve limits braked back over the lookahead, the
 * terminal, and the vehicle ahead braked back over its margin. Writes the plan with and without the vehicle ahead.
 * Each 5 m cell reads the grip of the surface on the lane at its start: its curve speed uses the lateral limit times
 * that grip, and braking toward it, toward the terminal or behind the vehicle ahead uses the least grip on the lane
 * from the first cell through the cell where the braking ends (recorded in the workspace for `envelopeSpeedBehind`).
 */
function plannedTargetSpeed(
  road: DriverRoad,
  s: number,
  speed: number,
  driver: Driver,
  targetL: Lane,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null,
): number {
  const { envelope, speedCap, braking, utilization } = driver;
  const { coordinates } = road;
  if (workspace.road !== road || workspace.lane !== targetL) {
    workspace.cellStarts.fill(NaN);
    workspace.speedCells.fill(NaN);
    workspace.road = road;
    workspace.lane = targetL;
  }
  if (workspace.envelope !== envelope || workspace.utilization !== utilization || workspace.speedCap !== speedCap) {
    workspace.speedCells.fill(NaN);
    workspace.envelope = envelope;
    workspace.utilization = utilization;
    workspace.speedCap = speedCap;
  }
  let targetSquared = speedCap ** 2;
  const first = Math.floor(s / ENVELOPE_DRIVER.spacing);
  let previousS = NaN,
    previousX = 0,
    previousZ = 0,
    previousHeading = 0;
  let leastGrip = Infinity;
  workspace.leastGripFirst = first;
  workspace.leastGripCount = 0;
  for (let cell = first; cell < first + CACHE_SIZE - 1; cell++) {
    const aS = Math.max(domain.start, cell * ENVELOPE_DRIVER.spacing);
    const bS = Math.min(domain.end, (cell + 1) * ENVELOPE_DRIVER.spacing);
    if (bS <= aS) break;
    const index = ((cell % CACHE_SIZE) + CACHE_SIZE) % CACHE_SIZE;
    if (workspace.cellStarts[index] !== aS || workspace.cellEnds[index] !== bS) {
      if (aS !== previousS) {
        const a = coordinates.toWorld(aS, typeof targetL === 'number' ? targetL : targetL(aS), workspace.a);
        previousX = a.x;
        previousZ = a.z;
        previousHeading = a.heading;
      }
      const b = coordinates.toWorld(bS, typeof targetL === 'number' ? targetL : targetL(bS), workspace.b);
      const curvature =
        Math.abs(wrapAngle(b.heading - previousHeading)) /
        Math.max(ENVELOPE_DRIVER.minimumCurvatureChord, Math.hypot(b.x - previousX, b.z - previousZ));
      previousS = bS;
      previousX = b.x;
      previousZ = b.z;
      previousHeading = b.heading;
      workspace.curvatures[index] = curvature;
      workspace.grips[index] = gripAt(road, aS, typeof targetL === 'number' ? targetL : targetL(aS));
      workspace.cellStarts[index] = aS;
      workspace.cellEnds[index] = bS;
      workspace.speedCells[index] = NaN;
    }
    if (workspace.speedCells[index] !== cell) {
      const curvature = workspace.curvatures[index]!;
      let curveSpeed = speedCap;
      if (curvature >= MIN_DRIVER_CURVATURE_PER_METER)
        for (let iteration = 0; iteration < ENVELOPE_DRIVER.curveSpeedIterations; iteration++)
          curveSpeed = Math.min(
            speedCap,
            Math.sqrt(
              (utilization * envelopeAt(envelope, curveSpeed, workspace.row).lateral * workspace.grips[index]!) /
                curvature,
            ),
          );
      workspace.speedsSquared[index] = curveSpeed ** 2;
      workspace.speedCells[index] = cell;
    }
    leastGrip = Math.min(leastGrip, workspace.grips[index]!);
    workspace.leastGrips[workspace.leastGripCount++] = leastGrip;
    const distance = Math.max(0, aS - s - speed * ENVELOPE_DRIVER.responseSeconds);
    targetSquared = Math.min(targetSquared, workspace.speedsSquared[index]! + 2 * braking * leastGrip * distance);
  }
  if (domain.terminal !== null) {
    // Leave room for input response and the front contact footprint; no pose/velocity correction.
    const distance = Math.max(
      0,
      domain.terminal - s - ENVELOPE_DRIVER.terminalClearance - speed * ENVELOPE_DRIVER.responseSeconds,
    );
    targetSquared = Math.min(targetSquared, 2 * braking * leastGripTo(workspace, domain.terminal) * distance);
  }
  workspace.plan.free = Math.sqrt(targetSquared);
  if (leader !== null)
    targetSquared = Math.min(
      targetSquared,
      leaderBoundSquared(s, speed, braking * leastGripTo(workspace, leader.s), leader),
    );
  workspace.plan.target = Math.sqrt(targetSquared);
  return workspace.plan.target;
}

/**
 * The least grip of the latest plan's lane from its first cell through the cell holding route station `s` (the last
 * planned cell's beyond it; grip 1 when nothing was planned).
 */
function leastGripTo(workspace: ReturnType<typeof createEnvelopeDriverWorkspace>, s: number): number {
  if (workspace.leastGripCount === 0) return 1;
  const k = Math.floor(s / ENVELOPE_DRIVER.spacing) - workspace.leastGripFirst;
  return workspace.leastGrips[Math.min(workspace.leastGripCount - 1, Math.max(0, k))]!;
}

/**
 * The square of the speed a driver at station `s` moving at `speed` with planning braking `braking` may plan behind
 * `leader`: the vehicle ahead is a moving planning point, reached at its speed with a footprint gap kept beyond the
 * response distance — the terminal clearance plus the following gap, or the leader's escape gap when that is more — as a
 * curve speed is reached over the remaining distance.
 */
function leaderBoundSquared(s: number, speed: number, braking: number, leader: EnvelopeLeader): number {
  // A vehicle ahead moving backward along the Route is planned for as a stopped one.
  const ahead = Math.max(0, leader.speed);
  const gap = Math.max(ENVELOPE_DRIVER.terminalClearance + ahead * ENVELOPE_DRIVER.followSeconds, leader.escape);
  const margin = Math.max(0, leader.s - s - leader.clearance - gap - speed * ENVELOPE_DRIVER.responseSeconds);
  return ahead ** 2 + 2 * braking * margin;
}

/**
 * Whether a driver at station `s` moving at route speed `speed` with planning braking `braking` can stop for `leader`
 * ahead; one moving backward can.
 */
export function envelopeCanFollow(s: number, speed: number, braking: number, leader: EnvelopeLeader): boolean {
  return speed <= 0 || speed ** 2 <= leaderBoundSquared(s, speed, braking, leader);
}

/**
 * The speed the driver's current plan would allow in a lane whose vehicle ahead is `leader`: the plan without a vehicle
 * ahead (`free`), behind that lane's leader. Curve speeds and grip are the current lane's (the plan in `workspace`);
 * adjacent lanes differ little in them.
 */
export function envelopeSpeedBehind(
  car: VehicleMotionRead,
  driver: Driver,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  free: number,
  leader: EnvelopeLeader | null,
): number {
  if (leader === null) return free;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const braking = driver.braking * leastGripTo(workspace, leader.s);
  return Math.sqrt(Math.min(free ** 2, leaderBoundSquared(car.course.s, speed, braking, leader)));
}

/**
 * The driver's planned speed at route station `s` in lane `targetL`, behind `leader` when one is given: the speed that
 * is its own planned target there, found by iterating the plan from the speed cap.
 */
export function plannedEnvelopeSpeed(
  road: DriverRoad,
  s: number,
  driver: Driver,
  targetL: Lane,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null = null,
): number {
  const workspace = createEnvelopeDriverWorkspace();
  let speed = driver.speedCap;
  for (let iteration = 0; iteration < ENVELOPE_DRIVER.plannedSpeedIterations; iteration++) {
    const next = plannedTargetSpeed(road, s, speed, driver, targetL, workspace, domain, leader);
    if (Math.abs(next - speed) < ENVELOPE_DRIVER.plannedSpeedTolerance) return next;
    speed = next;
  }
  return speed;
}

/**
 * The driver's plan now, at the vehicle's station and speed in lane `targetL`, behind `leader` when one is given: its
 * target speed without and with the vehicle ahead (borrowed from the workspace).
 */
export function planEnvelopeDriving(
  road: DriverRoad,
  car: VehicleMotionRead,
  driver: Driver,
  targetL: Lane,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null,
): { readonly free: number; readonly target: number } {
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  plannedTargetSpeed(road, car.course.s, speed, driver, targetL, workspace, domain, leader);
  return workspace.plan;
}

/** The driver's input, planning alone: no vehicle ahead constrains it (reference runs and scenario policies). */
export function sampleEnvelopeDrivingInput(
  road: DriverRoad,
  car: VehicleMotionRead,
  driver: Driver,
  targetL: Lane = 0,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
): DrivingInput {
  const { target } = planEnvelopeDriving(road, car, driver, targetL, workspace, domain, null);
  return envelopeDrivingInput(road, car, driver, targetL, workspace, domain, target);
}

/**
 * A vehicle's route speed (m/s): its velocity along the road's tangent at its route position, whose heading is
 * `roadHeading`; negative while it moves backward along the Route. Drivers see other vehicles' speeds as this.
 */
export function routeSpeed(car: VehicleMotionRead, roadHeading: number): number {
  return car.velocityX * Math.sin(roadHeading) + car.velocityZ * Math.cos(roadHeading);
}

/** The direction a vehicle travels in (rad, as yaw): its yaw turned by its slip, read at a least forward speed. */
export function travelYaw(car: VehicleMotionRead): number {
  return car.yaw + Math.atan2(car.lateralSpeed, Math.max(ENVELOPE_DRIVER.travelYawMinimumSpeed, car.longitudinalSpeed));
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
 * The path a driver's pursuit steering takes from route station `s` and lateral `l`, travelling at `heading` (rad) to
 * the road, toward the lateral `target` gives its steering `lookahead` ahead: traced kinematically in the road's frame,
 * as on a straight road, over four lookaheads, in which the steering settles. Written to `path`.
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
      Math.max(ENVELOPE_DRIVER.minimumTargetDistance, Math.hypot(lookahead, toward));
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

/**
 * How far ahead (m) a driver moving at `speed` (m/s) steers for: its response distance, at least `minimumLookahead` and
 * at most the plan's lookahead.
 */
export function steeringLookahead(speed: number): number {
  return Math.min(
    ENVELOPE_DRIVER.lookahead,
    Math.max(ENVELOPE_DRIVER.minimumLookahead, speed * ENVELOPE_DRIVER.responseSeconds),
  );
}

/**
 * The driver's input toward lane `targetL` at the planned `targetSpeed`: pursuit steering for the lane's lateral its
 * steering lookahead ahead, and pedals.
 */
export function envelopeDrivingInput(
  road: DriverRoad,
  car: VehicleMotionRead,
  driver: Driver,
  targetL: Lane,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
  targetSpeed: number,
): DrivingInput {
  const s = car.course.s;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const { envelope } = driver;
  const targetS = clamp(s + steeringLookahead(speed), domain.start, domain.end);
  const target = road.coordinates.toWorld(
    targetS,
    typeof targetL === 'number' ? targetL : targetL(targetS),
    workspace.target,
  );
  const angle = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - travelYaw(car));
  const distance = Math.max(ENVELOPE_DRIVER.minimumTargetDistance, Math.hypot(target.x - car.x, target.z - car.z));
  const acceleration =
    (2 * Math.sin(angle) * Math.max(ENVELOPE_DRIVER.steeringDemandMinimumSpeed ** 2, speed ** 2)) / distance;
  const steering =
    car.longitudinalSpeed <= 0
      ? 0
      : clamp(
          acceleration /
            envelopeAt(envelope, Math.max(speed, ENVELOPE_DRIVER.steeringGainMinimumSpeed), workspace.row).steeringGain,
          -1,
          1,
        );
  workspace.input.steering = steering;
  workspace.input.throttle = speed < targetSpeed - ENVELOPE_DRIVER.speedDeadzone;
  // A target within the deadzone of standstill is a stop: the brake holds, whatever the residual speed of a stopped leader.
  workspace.input.brake =
    targetSpeed < ENVELOPE_DRIVER.speedDeadzone || speed > targetSpeed + ENVELOPE_DRIVER.speedDeadzone;
  return workspace.input;
}
