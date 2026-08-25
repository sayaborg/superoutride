import { compileSurfaceRegions } from '../compiler/surface-region-compiler.js';
import { CyclicSurfaceMap } from '../physics/surface-map.js';
import { createM5DebugSurfaceRegionAuthoring } from './m5-surface-authoring.js';

/** DEV closed-course authoring explicitly opts into cyclic SurfaceMap addressing. */
export function createM5DebugSurfaceMap(courseLength: number): CyclicSurfaceMap {
  const compiled = compileSurfaceRegions(courseLength, createM5DebugSurfaceRegionAuthoring(courseLength));
  return new CyclicSurfaceMap(courseLength, compiled.surfaceSections);
}
