import { compileGuidePath, type GuidePath } from '../../core/guide-curve.js';
import { HeightProfile } from '../../core/height-profile.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  LOGICAL_HEIGHT,
} from '../../core/presentation-scale.js';
import { JunctionCrossSectionProfile } from '../../course/junction-cross-section.js';
import type { RecoveryProfile } from '../../gameplay/recovery.js';
import { GROUND_COLORS, type GroundMapProfile } from '../../groundmap/ground-map.js';
import { SurfaceMap } from '../../physics/surface-map.js';
import type { TerrainVisualProfile } from '../../road/terrain-line.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import type { ParentForkGeometry } from './child-stage-continuation.js';
import {
  createHighwayCalibrationLapRaster,
  createHighwayGroundProfile,
  createHighwaySurfaceMap,
  HIGHWAY_HIGHWAY_RECOVERY_PROFILE,
  HIGHWAY_HIGHWAY_RIVAL_RECOVERY_PROFILE,
  HIGHWAY_PLAYER_START_L,
  HIGHWAY_RIVAL_START_L,
} from './highway-calibration.js';
import { CENTER_DASH_MARKINGS } from './stadium-surface-authoring.js';

export const BRANCHING_FORK_WIDEN_START_S = 5_800;
const BRANCHING_FORK_MEDIAN_START_S = 5_900;
const BRANCHING_FORK_SEPARATED_START_S = 6_000;
export const BRANCHING_ROUTE_GATE_S = 6_060;
export const BRANCHING_HANDOFF_SEAM_S = 6_120;

export const BRANCHING_DEFAULT_BRANCHING_JUNCTION = new JunctionCrossSectionProfile({
  sWidenStart: BRANCHING_FORK_WIDEN_START_S,
  sMedianStart: BRANCHING_FORK_MEDIAN_START_S,
  sSeparatedStart: BRANCHING_FORK_SEPARATED_START_S,
  parentRoadWidth: 14,
  childRoadWidth: 7,
  finalMedianWidth: 8,
  shoulderWidth: 1.5,
});

export const BRANCHING_DEFAULT_BRANCHING_FORK: Readonly<ParentForkGeometry> = Object.freeze({
  junction: BRANCHING_DEFAULT_BRANCHING_JUNCTION,
  routeGateS: BRANCHING_ROUTE_GATE_S,
  handoffSeamS: BRANCHING_HANDOFF_SEAM_S,
});

export const BRANCHING_PLAYER_START_L = HIGHWAY_PLAYER_START_L;
export const BRANCHING_RIVAL_START_L = HIGHWAY_RIVAL_START_L;
export const BRANCHING_PLAYER_RECOVERY_PROFILE: Readonly<RecoveryProfile> = HIGHWAY_HIGHWAY_RECOVERY_PROFILE;
export const BRANCHING_RIVAL_RECOVERY_PROFILE: Readonly<RecoveryProfile> = HIGHWAY_HIGHWAY_RIVAL_RECOVERY_PROFILE;

export interface DefaultBranchingParent {
  readonly guide: GuidePath;
  readonly heightProfile: HeightProfile;
  readonly visualProfile: VisualProfile;
  readonly surfaceMap: SurfaceMap;
  readonly groundProfile: GroundMapProfile;
  readonly terrainProfile: TerrainVisualProfile;
}

/**
 * Default BRANCHING parent stage.
 *
 * The closed geometric source is deliberately consumed as one finite ordinary open path.
 * BRANCHING exits through physical gates before the authored endpoint; no wrapping or circuit
 * progress is present in this composition.
 */
export function createDefaultBranchingParent(): DefaultBranchingParent {
  const guide = compileGuidePath(createHighwayCalibrationLapRaster(), {
    lMax: 20,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  const heightProfile = createBranchingHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, [
    {
      sStart: 0,
      name: 'DEFAULT FOUR-LANE BRANCHING HIGHWAY',
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    },
  ]);
  const baseSurface = createHighwaySurfaceMap(guide.length);
  const surfaceMap = new SurfaceMap(guide.length, baseSurface.sections, BRANCHING_DEFAULT_BRANCHING_JUNCTION);
  const groundProfile: GroundMapProfile = {
    ...createHighwayGroundProfile(),
    groundLeft: 13,
    groundRight: 13,
    junction: BRANCHING_DEFAULT_BRANCHING_JUNCTION,
    junctionMarkings: CENTER_DASH_MARKINGS,
  };
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

function createBranchingHeightProfile(courseLength: number): HeightProfile {
  if (!(courseLength > BRANCHING_HANDOFF_SEAM_S + 500)) {
    throw new RangeError('parent Guide must retain runout beyond the first handoff');
  }
  return new HeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: 100, y: 0 },
    { s: 700, y: 0 },
    { s: 1_400, y: 12 },
    { s: 2_100, y: -8 },
    { s: 3_000, y: 24 },
    { s: 3_800, y: 0 },
    { s: 4_600, y: -12 },
    { s: 5_350, y: 18 },
    { s: 5_600, y: 0 },
    { s: 6_300, y: 0 },
    { s: courseLength, y: 0 },
  ]);
}
