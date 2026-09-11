import { SurfaceMap } from '../../physics/surface-map.js';
import { compileSurfaceRegions } from '../../runtime/surface-region-compiler.js';
import { createStadiumSurfaceRegionAuthoring } from '../courses/stadium-surface-authoring.js';

/** Finite surface fixture shared by physics regressions. */
export function createMaterialTransitionSurfaceMap(courseLength: number): SurfaceMap {
  const compiled = compileSurfaceRegions(courseLength, createStadiumSurfaceRegionAuthoring(courseLength));
  return new SurfaceMap(courseLength, compiled.surfaceSections);
}
