import { VisualProfile } from '../../visual/visual-profile.js';
import { createStadiumEnvironment, STADIUM_SURFACE_BASE_COLORS } from './stadium-environment.js';

export const CLIFF_BASE_COLORS = STADIUM_SURFACE_BASE_COLORS;

export function createCliffVisualProfile(courseLength: number): VisualProfile {
  const compiled = createStadiumEnvironment(courseLength);
  return new VisualProfile(courseLength, compiled.visualSections);
}
