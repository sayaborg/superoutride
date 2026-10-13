import type { AutomaticPowertrainState } from './automatic-powertrain.js';
import type { VehicleTireObservation } from './vehicle-tire-observation.js';
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

/** Vehicle state read by the chase camera (body pitch and body-frame speeds) and drivers. */
export interface VehicleMotionRead extends VehicleWorldPoseRead {
  readonly sprungPitch: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
}

/**
 * Vehicle state a driver reads: its motion, its horizontal world velocity (m/s), its gear and engine speed, and its
 * tires' observations.
 */
export interface VehicleDrivingRead extends VehicleMotionRead {
  readonly velocityX: number;
  readonly velocityZ: number;
  readonly powertrain: Readonly<Pick<AutomaticPowertrainState, 'gear' | 'engineRpm'>>;
  readonly tires: VehicleTireObservation;
}

/** Vehicle state read by the pseudo-3D renderer. */
export interface VehicleRenderRead extends VehicleWorldPoseRead {
  readonly lateralAcceleration: number;
}
