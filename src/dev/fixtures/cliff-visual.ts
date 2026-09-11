import { compileSurfaceRegions } from '../../runtime/surface-region-compiler.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import {
  createStadiumSurfaceRegionAuthoring,
  STADIUM_SURFACE_BASE_COLORS,
} from '../courses/stadium-surface-authoring.js';

export const CLIFF_BASE_COLORS = STADIUM_SURFACE_BASE_COLORS;

export function createCliffVisualProfile(courseLength: number): VisualProfile {
  const compiled = compileSurfaceRegions(courseLength, createStadiumSurfaceRegionAuthoring(courseLength));
  return new VisualProfile(courseLength, compiled.visualSections);
}
