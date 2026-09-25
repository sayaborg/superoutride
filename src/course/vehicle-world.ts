import type { PlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { ProfileReader } from './geometry/profile.js';
import type { SurfaceMaterial } from './surface-material.js';

export interface SurfaceSample {
  readonly material: SurfaceMaterial | null;
}

export const NO_MATERIAL_SURFACE = Object.freeze({ material: null });
const samples = new WeakMap<SurfaceMaterial, Readonly<SurfaceSample>>();

export function surfaceSample(material: SurfaceMaterial | null): SurfaceSample {
  if (material === null) return NO_MATERIAL_SURFACE;
  let sample = samples.get(material);
  if (!sample) {
    sample = Object.freeze({ material });
    samples.set(material, sample);
  }
  return sample;
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
