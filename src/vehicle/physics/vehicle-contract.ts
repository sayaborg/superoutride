import type { PlanCoordinateProjection } from '../../course/geometry/plan-coordinate.js';

/**
 * Read-only world pose consumed outside concrete vehicle physics. Every field is required and read.
 * `course` is the derived plan coordinate observation's chainage and lateral; only physics and recovery write it.
 */
export interface VehicleWorldPoseRead {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly course: Readonly<Pick<PlanCoordinateProjection, 's' | 'l'>>;
  /** Derived visual anchor. It follows the CG in flight but preserves static sprite ground contact. */
  readonly renderY: number;
}

/** Vehicle state read by the chase camera (body pitch and body-frame speeds) and the envelope driver. */
export interface VehicleMotionRead extends VehicleWorldPoseRead {
  readonly sprungPitch: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
}

/** Vehicle state the envelope driver reads: its motion and its horizontal world velocity (m/s). */
export interface VehicleDrivingRead extends VehicleMotionRead {
  readonly velocityX: number;
  readonly velocityZ: number;
}

/** Vehicle state read by the pseudo-3D renderer. */
export interface VehicleRenderRead extends VehicleWorldPoseRead {
  readonly lateralAcceleration: number;
}
