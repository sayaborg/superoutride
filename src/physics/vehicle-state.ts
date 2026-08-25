import type { CourseCoordinate } from '../core/guide-curve.js';

export interface VehicleKinematicState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  sprungRoll: number;
  course: CourseCoordinate;
}
