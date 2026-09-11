import { SurfaceMap } from '../physics/surface-map.js';
import { compileSurfaceRegions } from '../runtime/surface-region-compiler.js';
import { createM5DebugSurfaceRegionAuthoring } from './m5-surface-authoring.js';

/** Finite surface fixture shared by physics regressions. */
export function createM5DebugSurfaceMap(courseLength: number): SurfaceMap {
  const compiled = compileSurfaceRegions(courseLength, createM5DebugSurfaceRegionAuthoring(courseLength));
  return new SurfaceMap(courseLength, compiled.surfaceSections);
}
