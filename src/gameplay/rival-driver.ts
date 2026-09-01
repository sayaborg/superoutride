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
const CURVATURE_PROBE_STEP_METERS = 10;
const STRAIGHT_CRUISE_SPEED_MPS = 56;
const MIN_CURVE_SPEED_MPS = 12;
const LATERAL_ACCEL_TARGET_G = 0.42;
const BRAKING_DECELERATION_TARGET_MPS2 = 4;
const MAX_CURVE_BRAKING_DISTANCE_METERS = (
  STRAIGHT_CRUISE_SPEED_MPS ** 2 - MIN_CURVE_SPEED_MPS ** 2
) / (2 * BRAKING_DECELERATION_TARGET_MPS2);
// Cover the full 56 -> 12 m/s braking distance, rounded to the contiguous lattice, plus two
// complete probe spans so a curve entering the terminal interval cannot become a sparse blind spot.
const CURVATURE_LOOKAHEAD_METERS = (
  Math.ceil(MAX_CURVE_BRAKING_DISTANCE_METERS / CURVATURE_PROBE_STEP_METERS)
    * CURVATURE_PROBE_STEP_METERS
  + 2 * CURVATURE_PROBE_SPAN_METERS
);
const MAX_STEERING_REQUEST = 0.72;
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
      - car.lateralSpeed * 0.020,
    -1,
    1,
  );
  const steering = car.longitudinalSpeed <= 0
    ? 0
    : MAX_STEERING_REQUEST * Math.sign(pathDemand) * Math.sqrt(Math.abs(pathDemand));

  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  return {
    steering,
    throttle: speed < targetSpeed - SPEED_DEADBAND_MPS,
    brake: speed > targetSpeed + SPEED_DEADBAND_MPS,
  };
}

export function estimateUpcomingTargetSpeed(guide: GuideCoordinateSource, s: number): number {
  const curve = guideCoordinateCurve(guide);
  let targetSpeed = STRAIGHT_CRUISE_SPEED_MPS;
  for (
    let offset = 0;
    offset < CURVATURE_LOOKAHEAD_METERS;
    offset += CURVATURE_PROBE_STEP_METERS
  ) {
    const aS = Math.min(curve.length, s + offset);
    const bS = Math.min(curve.length, aS + CURVATURE_PROBE_SPAN_METERS);
    if (bS <= aS + GUIDE_EPSILON) break;

    const a = sampleGuideCurve(curve, aS);
    const b = sampleGuideCurve(curve, bS);
    const curvature = Math.abs(wrapAngle(b.heading - a.heading)) / (bS - aS);
    if (curvature < 1e-6) continue;

    const curveSpeed = clamp(
      Math.sqrt((LATERAL_ACCEL_TARGET_G * G) / curvature),
      MIN_CURVE_SPEED_MPS,
      STRAIGHT_CRUISE_SPEED_MPS,
    );
    // Convert each future curve speed into the speed that can be carried now while retaining the
    // same ordinary braking envelope. Taking the minimum avoids the old discontinuous rule that
    // imposed a distant curve's final speed immediately throughout one fixed lookahead window.
    const distance = Math.max(0, aS - s);
    const allowedNow = Math.sqrt(
      curveSpeed * curveSpeed + 2 * BRAKING_DECELERATION_TARGET_MPS2 * distance,
    );
    targetSpeed = Math.min(targetSpeed, allowedNow);
  }

  return clamp(targetSpeed, MIN_CURVE_SPEED_MPS, STRAIGHT_CRUISE_SPEED_MPS);
}
