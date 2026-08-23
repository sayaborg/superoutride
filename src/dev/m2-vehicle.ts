import type { DrivingInput } from '../input/driving-input.js';
import {
  guideCourseToWorld,
  locateWorldOnGuideLocal,
  type CourseCoordinate,
  type GuideCurve,
} from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';

export interface M2VehicleState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  sprungRoll: number;
  course: CourseCoordinate;
}

export function createM2Vehicle(guide: GuideCurve, s = 45): M2VehicleState {
  const world = guideCourseToWorld(guide, s, 0);
  return {
    x: world.x,
    z: world.z,
    yaw: world.heading,
    speed: 45,
    sprungRoll: 0,
    course: {
      s: world.s,
      l: 0,
      segmentIndex: world.segmentIndex,
      distanceSquared: 0,
    },
  };
}

export function updateM2Vehicle(
  guide: GuideCurve,
  vehicle: M2VehicleState,
  input: DrivingInput,
  dt: number,
): void {
  const steeringRate = 0.65;
  const accel = input.throttle ? 9 : 0;
  const brake = input.brake ? 24 : 0;
  const rollingDrag = input.throttle ? 0.3 : 0.9;

  vehicle.yaw = wrapAngle(vehicle.yaw + input.steering * steeringRate * dt);
  vehicle.speed = clamp(vehicle.speed + (accel - brake - rollingDrag) * dt, 0, 70);
  const rollTarget = input.steering * 0.55 * clamp(vehicle.speed / 30, 0, 1);
  const rollAlpha = 1 - Math.exp(-dt / 0.16);
  vehicle.sprungRoll += (rollTarget - vehicle.sprungRoll) * rollAlpha;
  vehicle.x += Math.sin(vehicle.yaw) * vehicle.speed * dt;
  vehicle.z += Math.cos(vehicle.yaw) * vehicle.speed * dt;

  vehicle.course = locateWorldOnGuideLocal(
    guide,
    { x: vehicle.x, z: vehicle.z },
    vehicle.course.segmentIndex,
    3,
    false,
  );
}
