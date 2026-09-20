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

export function envelopeAt(envelope: VehicleEnvelope, speed: number) {
  const rows = envelope.rows;
  let i = 1;
  while (i < rows.length && rows[i]!.speed < speed) i++;
  const a = rows[Math.max(0, i - 1)]!,
    b = rows[Math.min(i, rows.length - 1)]!;
  const f = a === b ? 0 : clamp((speed - a.speed) / (b.speed - a.speed), 0, 1);
  return {
    acceleration: a.acceleration + f * (b.acceleration - a.acceleration),
    braking: a.braking + f * (b.braking - a.braking),
    lateral: a.lateral + f * (b.lateral - a.lateral),
    steeringGain: a.steeringGain + f * (b.steeringGain - a.steeringGain),
  };
}

export function sampleReferenceDrivingInput(
  guide: GuideCoordinateSource,
  car: VehicleCameraReadState,
  envelope: VehicleEnvelope,
  targetL: number | ((s: number) => number) = 0,
): DrivingInput {
  const domain = guideCoordinateDomain(guide),
    s = car.course.s;
  const lane = (s: number) => (typeof targetL === 'number' ? targetL : targetL(s));
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  let targetSpeed = envelope.maximumSpeed;
  const braking = Math.min(...envelope.rows.map((r) => r.braking)) * REFERENCE_DRIVER.utilization;
  for (let offset = 0; offset < REFERENCE_DRIVER.lookahead; offset += REFERENCE_DRIVER.spacing) {
    const aS = Math.min(domain.end, s + offset),
      bS = Math.min(domain.end, aS + REFERENCE_DRIVER.spacing);
    if (bS <= aS) break;
    const a = guideCoordinateToWorld(guide, aS, lane(aS)),
      b = guideCoordinateToWorld(guide, bS, lane(bS));
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    if (curvature < 1e-7) continue;
    let curveSpeed = envelope.maximumSpeed;
    for (let iteration = 0; iteration < 4; iteration++)
      curveSpeed = Math.min(
        envelope.maximumSpeed,
        Math.sqrt((REFERENCE_DRIVER.utilization * envelopeAt(envelope, curveSpeed).lateral) / curvature),
      );
    const distance = Math.max(0, offset - speed * REFERENCE_DRIVER.responseSeconds);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(curveSpeed ** 2 + 2 * braking * distance));
  }
  const lookahead = Math.max(8, speed * REFERENCE_DRIVER.responseSeconds);
  const targetS = Math.min(domain.end, s + lookahead);
  const target = guideCoordinateToWorld(guide, targetS, lane(targetS));
  const travelYaw = car.yaw + Math.atan2(car.lateralSpeed, Math.max(0.1, car.longitudinalSpeed));
  const angle = wrapAngle(Math.atan2(target.x - car.x, target.z - car.z) - travelYaw);
  const distance = Math.max(1, Math.hypot(target.x - car.x, target.z - car.z));
  const acceleration = (2 * Math.sin(angle) * Math.max(25, speed ** 2)) / distance;
  const steering =
    car.longitudinalSpeed <= 0 ? 0 : clamp(acceleration / envelopeAt(envelope, Math.max(speed, 5)).steeringGain, -1, 1);
  return {
    steering,
    throttle: speed < targetSpeed - REFERENCE_DRIVER.speedDeadband,
    brake: speed > targetSpeed + REFERENCE_DRIVER.speedDeadband,
  };
}
