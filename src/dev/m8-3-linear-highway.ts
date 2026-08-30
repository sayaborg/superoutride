import { compileRasterPath } from '../core/course.js';
import { compileGuidePath, type GuideCurve } from '../core/guide-curve.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../core/presentation-scale.js';
import { compileCourseMode, type CourseModeProfile } from '../gameplay/course-mode.js';
import type { M5RecoveryProfile } from '../gameplay/recovery.js';
import { SurfaceMap } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import { GROUND_COLORS, type GroundMapProfile } from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import {
  M7_1_HIGHWAY_RECOVERY_PROFILE,
  M7_1_PLAYER_START_L,
  createM71HighwayGroundProfile,
  createM71HighwaySurfaceMap,
} from './m7-1-highway-calibration-course.js';

export const M8_3_LINEAR_LENGTH_METERS = 8_000;
export const M8_3_LINEAR_PLAYER_START_L = M7_1_PLAYER_START_L;
export const M8_3_LINEAR_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> =
  M7_1_HIGHWAY_RECOVERY_PROFILE;
export const M8_3_LINEAR_COURSE_MODE: CourseModeProfile = compileCourseMode({
  id: 'DEV_OPEN_EIGHT_KILOMETER_HIGHWAY',
  routeKind: 'LINEAR',
  rivalCount: 0,
});

export interface M83LinearHighwayRuntime {
  readonly guide: GuideCurve;
  readonly heightProfile: HeightProfile;
  readonly visualProfile: VisualProfile;
  readonly surfaceMap: SurfaceMap;
  readonly groundProfile: GroundMapProfile;
  readonly terrainProfile: TerrainVisualProfile;
}

/** One ordinary finite open road: no branch gates, endpoint seam, modulo or lap authority. */
export function createM83LinearHighwayRuntime(): M83LinearHighwayRuntime {
  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: M8_3_LINEAR_LENGTH_METERS },
  ]);
  const guide = compileGuidePath(raster, {
    lMax: 12,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  const heightProfile = new HeightProfile(guide.length, [
    { s: 0, y: 0 },
    { s: 800, y: 0 },
    { s: 1_600, y: 16 },
    { s: 2_500, y: -10 },
    { s: 3_500, y: 24 },
    { s: 4_600, y: 0 },
    { s: 5_500, y: -14 },
    { s: 6_500, y: 18 },
    { s: 7_300, y: 0 },
    { s: guide.length, y: 0 },
  ]);
  const visualProfile = new VisualProfile(guide.length, [{
    sStart: 0,
    name: 'M8.3 OPEN EIGHT KILOMETER HIGHWAY',
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
  }]);
  const surfaceMap = createM71HighwaySurfaceMap(guide.length);
  const groundProfile = createM71HighwayGroundProfile();
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: 240,
    dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
    dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
    groundLeft: groundProfile.groundLeft,
    groundRight: groundProfile.groundRight,
    roadLeft: groundProfile.roadLeft,
    roadRight: groundProfile.roadRight,
    height: heightProfile,
    visual: visualProfile,
    thinSpanScreenRows: 1,
  };

  return Object.freeze({
    guide,
    heightProfile,
    visualProfile,
    surfaceMap,
    groundProfile: Object.freeze(groundProfile),
    terrainProfile: Object.freeze(terrainProfile),
  });
}
