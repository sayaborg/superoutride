import { compileGuidePath, type GuidePath } from '../../core/guide-curve.js';
import { HeightProfile } from '../../core/height-profile.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  LOGICAL_HEIGHT,
} from '../../core/presentation-scale.js';
import { compileRasterPath } from '../../core/raster-path.js';
import { compileCourseMode, type CourseModeProfile } from '../../gameplay/course-mode.js';
import type { RecoveryProfile } from '../../gameplay/recovery.js';
import { compileSessionConfiguration } from '../../gameplay/session-configuration.js';
import { GROUND_COLORS, type GroundMapProfile } from '../../groundmap/ground-map.js';
import { validateSurfaceGuideEnvelope } from '../../physics/surface-guide-envelope.js';
import { SurfaceMap } from '../../physics/surface-map.js';
import type { TerrainVisualProfile } from '../../road/terrain-line.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import {
  createHighwayGroundProfile,
  createHighwaySurfaceMap,
  HIGHWAY_HIGHWAY_RECOVERY_PROFILE,
  HIGHWAY_PLAYER_START_L,
} from './highway-calibration.js';

export const LINEAR_LENGTH_METERS = 8_000;
export const LINEAR_PLAYER_START_L = HIGHWAY_PLAYER_START_L;
export const LINEAR_RECOVERY_PROFILE: Readonly<RecoveryProfile> = HIGHWAY_HIGHWAY_RECOVERY_PROFILE;
export const LINEAR_COURSE_MODE: CourseModeProfile = compileCourseMode({
  id: 'DEV_OPEN_EIGHT_KILOMETER_HIGHWAY',
  routeKind: 'LINEAR',
});
export const LINEAR_SESSION_CONFIGURATION = compileSessionConfiguration({ rivalCount: 0 });

export interface LinearHighwayRuntime {
  readonly guide: GuidePath;
  readonly heightProfile: HeightProfile;
  readonly visualProfile: VisualProfile;
  readonly surfaceMap: SurfaceMap;
  readonly groundProfile: GroundMapProfile;
  readonly terrainProfile: TerrainVisualProfile;
}

/** One ordinary finite open road: no branch gates, endpoint seam, modulo or lap authority. */
export function createLinearHighwayRuntime(): LinearHighwayRuntime {
  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: LINEAR_LENGTH_METERS },
  ]);
  const guide = compileGuidePath(raster, {
    lMax: 13,
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
  const visualProfile = new VisualProfile(guide.length, [
    {
      sStart: 0,
      name: 'OPEN EIGHT KILOMETER HIGHWAY',
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    },
  ]);
  const surfaceMap = createHighwaySurfaceMap(guide.length);
  validateSurfaceGuideEnvelope(guide, surfaceMap);
  const groundProfile = createHighwayGroundProfile();
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: LOGICAL_HEIGHT,
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
