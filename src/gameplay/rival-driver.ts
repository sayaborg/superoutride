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
const STEERING_LOOKAHEAD_METERS = 24;
const CURVATURE_PROBE_SPAN_METERS = 10;
const CURVATURE_LOOKAHEAD_METERS = 100;
const CURVATURE_PROBE_STEP_METERS = 20;
const STRAIGHT_CRUISE_SPEED_MPS = 56;
const MIN_CURVE_SPEED_MPS = 18;
const LATERAL_ACCEL_TARGET_G = 0.72;
const SPEED_DEADBAND_MPS = 1;

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
  const target = guideCoordinateToWorld(guide, car.course.s + STEERING_LOOKAHEAD_METERS, targetL);
  const desiredYaw = Math.atan2(target.x - car.x, target.z - car.z);
  const yawError = wrapAngle(desiredYaw - car.yaw);

  // Heading-to-lookahead is the main command. Course.l is feedback for the AI controller
  // only; world X/Z remains physics authority and no coordinate is ever overwritten.
  const steering = clamp(
    yawError * 1.7 - (car.course.l - targetL) * 0.075 - car.lateralSpeed * 0.020,
    -1,
    1,
  );

  const targetSpeed = estimateUpcomingTargetSpeed(guide, car.course.s);
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
    const a = sampleGuideCurve(curve, s + offset);
    const b = sampleGuideCurve(curve, s + offset + CURVATURE_PROBE_SPAN_METERS);
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / CURVATURE_PROBE_SPAN_METERS;
    maxCurvature = Math.max(maxCurvature, curvature);
  }

  if (maxCurvature < 1e-6) return STRAIGHT_CRUISE_SPEED_MPS;
  const frictionLimited = Math.sqrt((LATERAL_ACCEL_TARGET_G * G) / maxCurvature);
  return clamp(frictionLimited, MIN_CURVE_SPEED_MPS, STRAIGHT_CRUISE_SPEED_MPS);
}
