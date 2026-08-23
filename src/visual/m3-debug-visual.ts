import { compileSurfaceRegions } from '../compiler/surface-region-compiler.js';
import { createM5DebugSurfaceRegionAuthoring, M5_SURFACE_BASE_COLORS } from '../dev/m5-surface-authoring.js';
import { CyclicVisualProfile } from './visual-profile.js';

export const M3_BASE_COLORS = M5_SURFACE_BASE_COLORS;

export function createM3DebugVisualProfile(courseLength: number): CyclicVisualProfile {
  const compiled = compileSurfaceRegions(courseLength, createM5DebugSurfaceRegionAuthoring(courseLength));
  return new CyclicVisualProfile(courseLength, compiled.visualSections);
}
