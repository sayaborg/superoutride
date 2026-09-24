import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleCameraReadState } from '../vehicle/physics/vehicle-contract.js';

// Inverse metres: curvature resolution floor (radius 10,000 km); suppresses heading
// differencing noise. At 100 m/s the omitted lateral demand is at most 0.001 m/s^2.
const MIN_DRIVER_CURVATURE_PER_METER = 1e-7;

export interface VehicleEnvelope {
  readonly maximumSpeed: number;
  readonly rows: readonly {
    readonly speed: number;
    readonly acceleration: number;
    readonly braking: number;
    readonly lateral: number;
    readonly steeringGain: number;
  }[];
}

/** Input/planning policy only. The measured envelope and production mechanics retain their own authority. */
export const ENVELOPE_DRIVER = Object.freeze({
  version: 3,
  lookahead: 480,
  spacing: 5,
  responseSeconds: 0.45,
  terminalClearance: 2,
  speedDeadzone: 0.15,
});

export function envelopeAt(
  envelope: VehicleEnvelope,
  speed: number,
  out: ReturnType<typeof createEnvelopeDriverWorkspace>['envelope'],
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

export function compileEnvelopeDriver(envelope: VehicleEnvelope, utilization: number, speedCap: number) {
  return Object.freeze({
    envelope,
    utilization,
    speedCap: Math.min(speedCap, envelope.maximumSpeed),
    braking: Math.min(...envelope.rows.map((row) => row.braking)) * utilization,
  });
}
type Driver = ReturnType<typeof compileEnvelopeDriver>;
type Lane = number | ((s: number) => number);
const CACHE_SIZE = Math.ceil(ENVELOPE_DRIVER.lookahead / ENVELOPE_DRIVER.spacing) + 1;

export function createEnvelopeDriverWorkspace() {
  return {
    coordinates: null as PlanCoordinateReader | null,
    lane: null as Lane | null,
    driver: null as Driver | null,
    cells: new Float64Array(CACHE_SIZE).fill(NaN),
    speedsSquared: new Float64Array(CACHE_SIZE),
    a: createPlanCoordinateSample(),
    b: createPlanCoordinateSample(),
    target: createPlanCoordinateSample(),
    envelope: { acceleration: 0, braking: 0, lateral: 0, steeringGain: 0 },
    input: { steering: 0, throttle: false, brake: false },
  };
}

export function sampleEnvelopeDrivingInput(
  coordinates: PlanCoordinateReader,
  car: VehicleCameraReadState,
  driver: Driver,
  targetL: Lane = 0,
  workspace: ReturnType<typeof createEnvelopeDriverWorkspace>,
  domain: { readonly start: number; readonly end: number; readonly terminal: number | null },
): DrivingInput {
  const s = car.course.s;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const { envelope, speedCap, braking, utilization } = driver;
  if (workspace.coordinates !== coordinates || workspace.lane !== targetL || workspace.driver !== driver) {
    workspace.cells.fill(NaN);
    workspace.coordinates = coordinates;
    workspace.lane = targetL;
    workspace.driver = driver;
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
        Math.abs(wrapAngle(b.heading - previousHeading)) / Math.max(0.01, Math.hypot(b.x - previousX, b.z - previousZ));
      previousS = bS;
      previousX = b.x;
      previousZ = b.z;
      previousHeading = b.heading;
      let curveSpeed = speedCap;
      if (curvature >= MIN_DRIVER_CURVATURE_PER_METER)
        for (let iteration = 0; iteration < 4; iteration++)
          curveSpeed = Math.min(
            speedCap,
            Math.sqrt((utilization * envelopeAt(envelope, curveSpeed, workspace.envelope).lateral) / curvature),
          );
      workspace.speedsSquared[index] = curveSpeed ** 2;
      workspace.cells[index] = cell;
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
  const targetSpeed = Math.sqrt(targetSquared);
  const lookahead = Math.min(ENVELOPE_DRIVER.lookahead, Math.max(8, speed * ENVELOPE_DRIVER.responseSeconds));
  const targetS = clamp(s + lookahead, domain.start, domain.end);
  const target = coordinates.toWorld(
    targetS,
    typeof targetL === 'number' ? targetL : targetL(targetS),
    workspace.target,
  );
  const travelYaw = car.yaw + Math.atan2(car.lateralSpeed, Math.max(0.1, car.longitudinalSpeed));
  const angle = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - travelYaw);
  const distance = Math.max(1, Math.hypot(target.x - car.x, target.z - car.z));
  const acceleration = (2 * Math.sin(angle) * Math.max(25, speed ** 2)) / distance;
  const steering =
    car.longitudinalSpeed <= 0
      ? 0
      : clamp(acceleration / envelopeAt(envelope, Math.max(speed, 5), workspace.envelope).steeringGain, -1, 1);
  workspace.input.steering = steering;
  workspace.input.throttle = speed < targetSpeed - ENVELOPE_DRIVER.speedDeadzone;
  workspace.input.brake = targetSpeed === 0 || speed > targetSpeed + ENVELOPE_DRIVER.speedDeadzone;
  return workspace.input;
}
