import { compileSurfaceRegions } from '../compiler/surface-region-compiler.js';
import { createM5DebugSurfaceRegionAuthoring, M5_SURFACE_BASE_COLORS } from '../dev/m5-surface-authoring.js';
import { VisualProfile } from './visual-profile.js';

export const M3_BASE_COLORS = M5_SURFACE_BASE_COLORS;

export function createM3DebugVisualProfile(courseLength: number): VisualProfile {
  const compiled = compileSurfaceRegions(courseLength, createM5DebugSurfaceRegionAuthoring(courseLength));
  return new VisualProfile(courseLength, compiled.visualSections);
}
