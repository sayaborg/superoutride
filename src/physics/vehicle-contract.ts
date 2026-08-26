import type { CourseCoordinate } from '../core/guide-curve.js';

/**
 * Read-only world pose consumed outside the concrete vehicle physics implementation.
 *
 * Physics remains authoritative for these values. Presentation/gameplay consumers may read
 * them but must never infer or rewrite physics internals from screen-space state.
 */
export interface VehicleWorldPoseRead {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Authoritative world-space linear velocity when supplied by current vehicle dynamics. */
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly velocityZ?: number;
  readonly course: CourseCoordinate;
}

/** Minimum vehicle state needed by the chase camera. */
export interface VehicleCameraReadState extends VehicleWorldPoseRead {
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly yawRate?: number;
  readonly sprungPitch?: number;
  readonly lateralAcceleration?: number;
}

/** Minimum vehicle state needed by the pseudo-3D renderer. */
export interface VehicleRenderReadState extends VehicleWorldPoseRead {
  readonly sprungRoll: number;
}
