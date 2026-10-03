import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleMotionRead } from '../vehicle/physics/vehicle-contract.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';

// Inverse metres: curvature resolution floor (radius 10,000 km); suppresses heading
// differencing noise. At 100 m/s the omitted lateral demand is at most 0.001 m/s^2.
const MIN_DRIVER_CURVATURE_PER_METER = 1e-7;

/** Input/planning policy only. The measured envelope and production mechanics retain their own authority. */
export const ENVELOPE_DRIVER = Object.freeze({
  version: 5,
  lookahead: 480,
  spacing: 5,
  responseSeconds: 0.45,
  terminalClearance: 2,
  speedDeadzone: 0.15,
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
 * changes lanes past slower vehicles (a driver that does not only follows them). Its builder decides each.
 */
export function compileEnvelopeDriver(
  envelope: RivalEnvelope,
  utilization: number,
  speedCap: number,
  changesLanes: boolean,
) {
  return Object.freeze({
    envelope,
    utilization,
    speedCap: Math.min(speedCap, envelope.maximumSpeed),
    braking: minimumBraking(envelope) * utilization,
    changesLanes,
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
  changesLanes: boolean,
) {
  const braking = minimumBraking(envelope);
  const driver = { ...compileEnvelopeDriver(envelope, utilization, speedCap, changesLanes) };
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

/** The vehicle ahead in the driver's lane: its route station, its speed (m/s) and half the two lengths (m). */
export interface EnvelopeLeader {
  readonly s: number;
  readonly speed: number;
  readonly clearance: number;
}
const CACHE_SIZE = Math.ceil(ENVELOPE_DRIVER.lookahead / ENVELOPE_DRIVER.spacing) + 1;

export function createEnvelopeDriverWorkspace() {
  return {
    // Curvature depends on the road and lane only; curve speeds also on the envelope, utilization and speed cap.
    coordinates: null as PlanCoordinateReader | null,
    lane: null as Lane | null,
    envelope: null as RivalEnvelope | null,
    utilization: NaN,
    speedCap: NaN,
    cells: new Float64Array(CACHE_SIZE).fill(NaN),
    curvatures: new Float64Array(CACHE_SIZE),
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

type DrivingDomain = { readonly start: number; readonly end: number; readonly terminal: number | null };

/**
 * The planned speed at route station `s` when moving at `speed`: curve limits braked back over the lookahead, the
 * terminal, and the vehicle ahead braked back over its margin. Writes the plan with and without the vehicle ahead.
 */
function plannedTargetSpeed(
  coordinates: PlanCoordinateReader,
  s: number,
  speed: number,
  driver: Driver,
  targetL: Lane,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null,
): number {
  const { envelope, speedCap, braking, utilization } = driver;
  if (workspace.coordinates !== coordinates || workspace.lane !== targetL) {
    workspace.cells.fill(NaN);
    workspace.speedCells.fill(NaN);
    workspace.coordinates = coordinates;
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
  for (let cell = first; cell < first + CACHE_SIZE - 1; cell++) {
    const aS = Math.max(domain.start, cell * ENVELOPE_DRIVER.spacing);
    const bS = Math.min(domain.end, (cell + 1) * ENVELOPE_DRIVER.spacing);
    if (bS <= aS) break;
    const index = ((cell % CACHE_SIZE) + CACHE_SIZE) % CACHE_SIZE;
    if (workspace.cells[index] !== cell) {
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
      workspace.cells[index] = cell;
      workspace.speedCells[index] = NaN;
    }
    if (workspace.speedCells[index] !== cell) {
      const curvature = workspace.curvatures[index]!;
      let curveSpeed = speedCap;
      if (curvature >= MIN_DRIVER_CURVATURE_PER_METER)
        for (let iteration = 0; iteration < ENVELOPE_DRIVER.curveSpeedIterations; iteration++)
          curveSpeed = Math.min(
            speedCap,
            Math.sqrt((utilization * envelopeAt(envelope, curveSpeed, workspace.row).lateral) / curvature),
          );
      workspace.speedsSquared[index] = curveSpeed ** 2;
      workspace.speedCells[index] = cell;
    }
    const distance = Math.max(0, aS - s - speed * ENVELOPE_DRIVER.responseSeconds);
    targetSquared = Math.min(targetSquared, workspace.speedsSquared[index]! + 2 * braking * distance);
  }
  if (domain.terminal !== null) {
    // Leave room for input response and the front contact footprint; no pose/velocity correction.
    const distance = Math.max(
      0,
      domain.terminal - s - ENVELOPE_DRIVER.terminalClearance - speed * ENVELOPE_DRIVER.responseSeconds,
    );
    targetSquared = Math.min(targetSquared, 2 * braking * distance);
  }
  workspace.plan.free = Math.sqrt(targetSquared);
  if (leader !== null) {
    // The vehicle ahead is a moving planning point: reach its speed with the following gap kept beyond the response
    // distance, as a curve speed is reached over the remaining distance.
    const margin = Math.max(
      0,
      leader.s -
        s -
        leader.clearance -
        speed * ENVELOPE_DRIVER.responseSeconds -
        leader.speed * ENVELOPE_DRIVER.followSeconds,
    );
    targetSquared = Math.min(targetSquared, leader.speed ** 2 + 2 * braking * margin);
  }
  workspace.plan.target = Math.sqrt(targetSquared);
  return workspace.plan.target;
}

/**
 * The driver's planned speed at route station `s` in lane `targetL`, behind `leader` when one is given: the speed that
 * is its own planned target there, found by iterating the plan from the speed cap.
 */
export function plannedEnvelopeSpeed(
  coordinates: PlanCoordinateReader,
  s: number,
  driver: Driver,
  targetL: Lane,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null = null,
): number {
  const workspace = createEnvelopeDriverWorkspace();
  let speed = driver.speedCap;
  for (let iteration = 0; iteration < ENVELOPE_DRIVER.plannedSpeedIterations; iteration++) {
    const next = plannedTargetSpeed(coordinates, s, speed, driver, targetL, workspace, domain, leader);
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
  coordinates: PlanCoordinateReader,
  car: VehicleMotionRead,
  driver: Driver,
  targetL: Lane,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
  leader: EnvelopeLeader | null,
): { readonly free: number; readonly target: number } {
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  plannedTargetSpeed(coordinates, car.course.s, speed, driver, targetL, workspace, domain, leader);
  return workspace.plan;
}

/** The driver's input, planning alone: no vehicle ahead constrains it (reference runs and scenario policies). */
export function sampleEnvelopeDrivingInput(
  coordinates: PlanCoordinateReader,
  car: VehicleMotionRead,
  driver: Driver,
  targetL: Lane = 0,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: DrivingDomain,
): DrivingInput {
  const { target } = planEnvelopeDriving(coordinates, car, driver, targetL, workspace, domain, null);
  return envelopeDrivingInput(coordinates, car, driver, targetL, workspace, domain, target);
}

/** The driver's input toward lane `targetL` at the planned `targetSpeed`: pursuit steering and pedals. */
export function envelopeDrivingInput(
  coordinates: PlanCoordinateReader,
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
  const lookahead = Math.min(
    ENVELOPE_DRIVER.lookahead,
    Math.max(ENVELOPE_DRIVER.minimumLookahead, speed * ENVELOPE_DRIVER.responseSeconds),
  );
  const targetS = clamp(s + lookahead, domain.start, domain.end);
  const target = coordinates.toWorld(
    targetS,
    typeof targetL === 'number' ? targetL : targetL(targetS),
    workspace.target,
  );
  const travelYaw =
    car.yaw + Math.atan2(car.lateralSpeed, Math.max(ENVELOPE_DRIVER.travelYawMinimumSpeed, car.longitudinalSpeed));
  const angle = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - travelYaw);
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
  workspace.input.brake = targetSpeed === 0 || speed > targetSpeed + ENVELOPE_DRIVER.speedDeadzone;
  return workspace.input;
}
