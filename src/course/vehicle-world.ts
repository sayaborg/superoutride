import type { PlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { ProfileReader } from './geometry/profile.js';
import type { SurfaceMaterial, SurfaceType } from './surface-material.js';

export interface SurfaceSample {
  readonly type: SurfaceType;
  readonly material: SurfaceMaterial;
}

/** Minimal read-only physics contract for SurfaceMap(s,l). */
export interface SurfaceMapReader {
  sample(s: number, l: number): SurfaceSample;
}

/** Active physical readers; content/chart selection is resolved by composition. */
export interface VehicleWorld {
  /** Shared extent authority: the Route in live driving, the native domain in envelope generation. */
  readonly extent: { readonly start: number; readonly end: number };
  readonly coordinates: PlanCoordinateReader;
  readonly height: ProfileReader;
  readonly surfaces: SurfaceMapReader;
}
