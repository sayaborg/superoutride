import type { PlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { HeightProfileReader } from './geometry/height-profile.js';
import type { SurfaceMaterial, SurfaceType } from './surface-material.js';

export interface SurfaceSample {
  readonly sectionName: string;
  readonly type: SurfaceType;
  readonly material: SurfaceMaterial;
}

/** Minimal read-only physics contract for SurfaceMap(s,l). */
export interface SurfaceMapReader {
  /** Conservative bound in this reader's local lateral frame, including all supported regions. */
  readonly maxSupportedAbsL: number;
  sample(s: number, l: number): SurfaceSample;
}

/** Active physical readers; content/chart selection is resolved by composition. */
export interface VehicleWorld {
  readonly coordinates: PlanCoordinateReader;
  readonly height: HeightProfileReader;
  readonly surfaces: SurfaceMapReader;
}
