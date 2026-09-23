import type { PlanCoordinateProjection } from '../../course/geometry/plan-coordinate.js';

/**
 * Read-only world pose consumed outside concrete vehicle physics.
 * World x/y/z is the physical CG authority. `course` is a derived plan coordinate observation cache only.
 */
export interface VehicleWorldPoseRead {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly velocityZ?: number;
  readonly course: PlanCoordinateProjection;
  /** Derived visual anchor. It follows the CG in flight but preserves static sprite ground contact. */
  readonly renderY?: number;
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
  readonly lateralAcceleration?: number;
  readonly longitudinalSpeed?: number;
  readonly yawRate?: number;
}
