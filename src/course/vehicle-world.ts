import type { PlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { ProfileReader } from './geometry/profile.js';
import type { SurfaceMaterial } from './surface-material.js';

/** Minimal read-only physics contract: the material at (s,l), or null where there is no ground. */
export interface SurfaceMapReader {
  sample(s: number, l: number): SurfaceMaterial | null;
}

/** Active physical readers; content/chart selection is resolved by composition. */
export interface VehicleWorld {
  /** Shared extent authority: the Route in live driving, the native domain in envelope generation. */
  readonly extent: { readonly start: number; readonly end: number };
  readonly coordinates: PlanCoordinateReader;
  readonly height: ProfileReader;
  readonly surfaces: SurfaceMapReader;
}
