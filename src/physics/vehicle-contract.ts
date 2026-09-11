import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { CourseCoordinate } from '../core/guide-curve.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import type { SurfaceMapReader } from './surface-map.js';

/** Active physical readers; content/chart selection is resolved by composition. */
export interface VehicleWorld {
  readonly guide: GuideCoordinateSource;
  readonly height: HeightProfileReader;
  readonly surfaces: SurfaceMapReader;
}

/**
 * Read-only world pose consumed outside concrete vehicle physics.
 * World x/y/z is the physical CG authority. `course` is a derived Guide observation cache only.
 */
export interface VehicleWorldPoseRead {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly velocityZ?: number;
  readonly course: CourseCoordinate;
  /** Derived visual anchor. It follows the CG in flight but preserves static sprite ground contact. */
  readonly presentationY?: number;
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
