import { sampleGuideCurve } from '../core/guide-curve.js';
import {
  guideCoordinateCurve,
  guideCoordinateToWorld,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';

const G = 9.80665;
const STEERING_LOOKAHEAD_METERS = 36;
const CURVATURE_PROBE_SPAN_METERS = 10;
const CURVATURE_LOOKAHEAD_METERS = 100;
const CURVATURE_PROBE_STEP_METERS = 20;
const STRAIGHT_CRUISE_SPEED_MPS = 56;
const MIN_CURVE_SPEED_MPS = 18;
const LATERAL_ACCEL_TARGET_G = 0.47;
const MAX_STEERING_REQUEST = 0.65;
const SPEED_DEADBAND_MPS = 0.25;
const GUIDE_EPSILON = 1e-9;

/**
 * Small deterministic DEV rival driver.
 *
 * It produces only canonical DrivingInput. It never writes world position, yaw, course.s/l,
 * or any renderer value, so the rival remains an ordinary world-physics vehicle.
 *
 * targetL is expressed in the supplied Guide coordinate source. Accepting a coordinate frame
 * keeps child-stage local l coherent with its lateral origin while plain GuideCurve callers
 * retain the original zero-origin behavior.
 */
export function sampleRivalDrivingInput(
  guide: GuideCoordinateSource,
  car: VehicleCameraReadState,
  targetL = 0,
): DrivingInput {
  const curve = guideCoordinateCurve(guide);
  const targetSpeed = estimateUpcomingTargetSpeed(guide, car.course.s);
  const targetS = Math.min(curve.length, car.course.s + STEERING_LOOKAHEAD_METERS);
  const target = guideCoordinateToWorld(guide, targetS, targetL);
  const desiredYaw = Math.atan2(target.x - car.x, target.z - car.z);
  const yawError = wrapAngle(desiredYaw - car.yaw);

  // Heading/lateral feedback publishes only an angular-offset request. The DEV rival remains an
  // ordinary input publisher and stays below the full player request.
  const pathDemand = clamp(
    yawError * 1.7
      - (car.course.l - targetL) * 0.075
      - car.lateralSpeed * 0.020
      - (car.yawRate ?? 0) * 0.50,
    -1,
    1,
  );
  const steering = car.longitudinalSpeed <= 0
    ? 0
    : MAX_STEERING_REQUEST * Math.sign(pathDemand) * Math.sqrt(Math.abs(pathDemand));

  const speed = Math.max(0, car.longitudinalSpeed);
  return {
    steering,
    throttle: speed < targetSpeed - SPEED_DEADBAND_MPS,
    brake: speed > targetSpeed + SPEED_DEADBAND_MPS,
  };
}

export function estimateUpcomingTargetSpeed(guide: GuideCoordinateSource, s: number): number {
  const curve = guideCoordinateCurve(guide);
  let maxCurvature = 0;
  for (
    let offset = CURVATURE_PROBE_STEP_METERS;
    offset <= CURVATURE_LOOKAHEAD_METERS;
    offset += CURVATURE_PROBE_STEP_METERS
  ) {
    const aS = Math.min(curve.length, s + offset);
    const bS = Math.min(curve.length, aS + CURVATURE_PROBE_SPAN_METERS);
    if (bS <= aS + GUIDE_EPSILON) break;

    const a = sampleGuideCurve(curve, aS);
    const b = sampleGuideCurve(curve, bS);
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / (bS - aS);
    maxCurvature = Math.max(maxCurvature, curvature);
  }

  if (maxCurvature < 1e-6) return STRAIGHT_CRUISE_SPEED_MPS;
  const frictionLimited = Math.sqrt((LATERAL_ACCEL_TARGET_G * G) / maxCurvature);
  return clamp(frictionLimited, MIN_CURVE_SPEED_MPS, STRAIGHT_CRUISE_SPEED_MPS);
}
