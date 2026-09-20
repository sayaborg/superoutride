import { hypot2 } from '../core/norm.js';
import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import { clamp, wrapAngle } from '../core/math.js';
import {
  guideCoordinateDomain,
  guideCoordinateToWorld,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';

interface VehicleEnvelope {
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
export const REFERENCE_DRIVER = Object.freeze({
  version: 1,
  utilization: 0.9,
  lookahead: 480,
  spacing: 5,
  responseSeconds: 0.45,
  speedDeadband: 0.15,
});

export function envelopeAt(
  envelope: VehicleEnvelope,
  speed: number,
  out = { acceleration: 0, braking: 0, lateral: 0, steeringGain: 0 },
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

export function createReferenceDriverWorkspace() {
  return {
    a: createPlanarCoordinateSample(),
    b: createPlanarCoordinateSample(),
    target: createPlanarCoordinateSample(),
    envelope: { acceleration: 0, braking: 0, lateral: 0, steeringGain: 0 },
    input: { steering: 0, throttle: false, brake: false },
  };
}

export function sampleReferenceDrivingInput(
  guide: GuideCoordinateSource,
  car: VehicleCameraReadState,
  envelope: VehicleEnvelope,
  targetL: number | ((s: number) => number) = 0,
  workspace = createReferenceDriverWorkspace(),
): DrivingInput {
  const domain = guideCoordinateDomain(guide),
    s = car.course.s;
  const speed = hypot2(car.longitudinalSpeed, car.lateralSpeed);
  let targetSpeed = envelope.maximumSpeed;
  let braking = Infinity;
  for (const row of envelope.rows) braking = Math.min(braking, row.braking);
  braking *= REFERENCE_DRIVER.utilization;
  for (let offset = 0; offset < REFERENCE_DRIVER.lookahead; offset += REFERENCE_DRIVER.spacing) {
    const aS = Math.min(domain.end, s + offset),
      bS = Math.min(domain.end, aS + REFERENCE_DRIVER.spacing);
    if (bS <= aS) break;
    const a = guideCoordinateToWorld(guide, aS, typeof targetL === 'number' ? targetL : targetL(aS), workspace.a),
      b = guideCoordinateToWorld(guide, bS, typeof targetL === 'number' ? targetL : targetL(bS), workspace.b);
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / Math.max(0.01, hypot2(b.x - a.x, b.z - a.z));
    if (curvature < 1e-7) continue;
    let curveSpeed = envelope.maximumSpeed;
    for (let iteration = 0; iteration < 4; iteration++)
      curveSpeed = Math.min(
        envelope.maximumSpeed,
        Math.sqrt(
          (REFERENCE_DRIVER.utilization * envelopeAt(envelope, curveSpeed, workspace.envelope).lateral) / curvature,
        ),
      );
    const distance = Math.max(0, offset - speed * REFERENCE_DRIVER.responseSeconds);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(curveSpeed ** 2 + 2 * braking * distance));
  }
  const lookahead = Math.max(8, speed * REFERENCE_DRIVER.responseSeconds);
  const targetS = Math.min(domain.end, s + lookahead);
  const target = guideCoordinateToWorld(
    guide,
    targetS,
    typeof targetL === 'number' ? targetL : targetL(targetS),
    workspace.target,
  );
  const travelYaw = car.yaw + Math.atan2(car.lateralSpeed, Math.max(0.1, car.longitudinalSpeed));
  const angle = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - travelYaw);
  const distance = Math.max(1, hypot2(target.x - car.x, target.z - car.z));
  const acceleration = (2 * Math.sin(angle) * Math.max(25, speed ** 2)) / distance;
  const steering =
    car.longitudinalSpeed <= 0
      ? 0
      : clamp(acceleration / envelopeAt(envelope, Math.max(speed, 5), workspace.envelope).steeringGain, -1, 1);
  workspace.input.steering = steering;
  workspace.input.throttle = speed < targetSpeed - REFERENCE_DRIVER.speedDeadband;
  workspace.input.brake = speed > targetSpeed + REFERENCE_DRIVER.speedDeadband;
  return workspace.input;
}
