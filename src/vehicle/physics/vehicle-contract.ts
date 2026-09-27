import type { PlanCoordinateProjection } from '../../course/geometry/plan-coordinate.js';

/**
 * Read-only world pose consumed outside concrete vehicle physics. Every field is required and read.
 * `course` is the derived plan coordinate observation's chainage; only physics and recovery write it.
 */
export interface VehicleWorldPoseRead {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly course: Readonly<Pick<PlanCoordinateProjection, 's'>>;
  /** Derived visual anchor. It follows the CG in flight but preserves static sprite ground contact. */
  readonly renderY: number;
}

/** Vehicle state read by the chase camera (velocity and body pitch) and the envelope driver (body speeds). */
export interface VehicleCameraReadState extends VehicleWorldPoseRead {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly velocityZ: number;
  readonly sprungPitch: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
}

/** Vehicle state read by the pseudo-3D renderer. */
export interface VehicleRenderReadState extends VehicleWorldPoseRead {
  readonly lateralAcceleration: number;
}
