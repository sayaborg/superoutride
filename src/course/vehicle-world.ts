import type { PlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { ProfileReader } from './geometry/profile.js';
import type { SurfaceMaterial } from './surface-material.js';

/** Minimal read-only physics contract: the material at (s,l), or null where there is no ground. */
export interface SurfaceMapReader {
  sample(s: number, l: number): SurfaceMaterial | null;
}

/** Active physical readers; content/chart selection is resolved by composition. */
export interface VehicleWorld {
  /**
   * Shared extent authority: the Route in live driving, the native domain in a standalone world. `terminal` is the
   * road's end where no Link leaves it (a standalone world's end), null while one does.
   */
  readonly extent: { readonly start: number; readonly end: number; readonly terminal: number | null };
  readonly coordinates: PlanCoordinateReader;
  readonly height: ProfileReader;
  readonly surfaces: SurfaceMapReader;
}
