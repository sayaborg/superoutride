import { guideCourseToWorld, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { M5CarState } from '../physics/car-physics.js';

const LOOKAHEAD_METERS = 30;
const CRUISE_SPEED_MPS = 58;
const BRAKE_SPEED_MPS = 62;

/**
 * Small deterministic DEV rival driver.
 *
 * It produces only canonical DrivingInput. It never writes world position, yaw, course.s/l,
 * or any renderer value, so the rival remains an ordinary world-physics vehicle.
 */
export function sampleRivalDrivingInput(
  guide: GuideCurve,
  car: M5CarState,
): DrivingInput {
  const target = guideCourseToWorld(guide, car.course.s + LOOKAHEAD_METERS, 0);
  const desiredYaw = Math.atan2(target.x - car.x, target.z - car.z);
  const yawError = wrapAngle(desiredYaw - car.yaw);

  // Heading-to-lookahead supplies the main command. Lateral velocity damping reduces
  // sustained oscillation without imposing a course-coordinate position correction.
  const steering = clamp(yawError * 1.8 - car.lateralSpeed * 0.018, -1, 1);
  const speed = Math.max(0, car.longitudinalSpeed);
  return {
    steering,
    throttle: speed < CRUISE_SPEED_MPS,
    brake: speed > BRAKE_SPEED_MPS,
  };
}
