import { guideCourseToWorld, sampleGuideCurve, type GuideCurve } from '../core/guide-curve.js';
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
 * The controller depends only on the read-only vehicle contract. Concrete car/bike physics
 * may be retuned or replaced later as long as they expose the same world kinematic outputs.
 */
export function sampleRivalDrivingInput(
  guide: GuideCurve,
  car: VehicleCameraReadState,
): DrivingInput {
  const target = guideCourseToWorld(guide, car.course.s + STEERING_LOOKAHEAD_METERS, 0);
  const desiredYaw = Math.atan2(target.x - car.x, target.z - car.z);
  const yawError = wrapAngle(desiredYaw - car.yaw);

  // Heading-to-lookahead is the main command. Course.l is feedback for the AI controller
  // only; world X/Z remains physics authority and no coordinate is ever overwritten.
  const steering = clamp(
    yawError * 1.7 - car.course.l * 0.075 - car.lateralSpeed * 0.020,
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

export function estimateUpcomingTargetSpeed(guide: GuideCurve, s: number): number {
  let maxCurvature = 0;
  for (
    let offset = CURVATURE_PROBE_STEP_METERS;
    offset <= CURVATURE_LOOKAHEAD_METERS;
    offset += CURVATURE_PROBE_STEP_METERS
  ) {
    const a = sampleGuideCurve(guide, s + offset);
    const b = sampleGuideCurve(guide, s + offset + CURVATURE_PROBE_SPAN_METERS);
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / CURVATURE_PROBE_SPAN_METERS;
    maxCurvature = Math.max(maxCurvature, curvature);
  }

  if (maxCurvature < 1e-6) return STRAIGHT_CRUISE_SPEED_MPS;
  const frictionLimited = Math.sqrt((LATERAL_ACCEL_TARGET_G * G) / maxCurvature);
  return clamp(frictionLimited, MIN_CURVE_SPEED_MPS, STRAIGHT_CRUISE_SPEED_MPS);
}
