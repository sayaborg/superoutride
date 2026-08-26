import { compileGuidePath, type GuideCurve } from '../core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import type { M5RecoveryProfile } from '../gameplay/recovery.js';
import { SurfaceMap } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import { GROUND_COLORS, type GroundMapProfile } from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import type { M622ParentForkGeometry } from './m6-22-child-stage-continuation.js';
import {
  M7_1_HIGHWAY_RECOVERY_PROFILE,
  M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE,
  M7_1_PLAYER_START_L,
  M7_1_RIVAL_START_L,
  createM71HighwayCalibrationLapRaster,
  createM71HighwayGroundProfile,
  createM71HighwaySurfaceMap,
} from './m7-1-highway-calibration-course.js';

export const M7_2_FORK_WIDEN_START_S = 5_800;
export const M7_2_FORK_MEDIAN_START_S = 5_900;
export const M7_2_FORK_SEPARATED_START_S = 6_000;
export const M7_2_ROUTE_GATE_S = 6_060;
export const M7_2_HANDOFF_SEAM_S = 6_120;

export const M7_2_DEFAULT_BRANCHING_JUNCTION = new JunctionCrossSectionProfile({
  sWidenStart: M7_2_FORK_WIDEN_START_S,
  sMedianStart: M7_2_FORK_MEDIAN_START_S,
  sSeparatedStart: M7_2_FORK_SEPARATED_START_S,
  parentRoadWidth: 14,
  childRoadWidth: 7,
  finalMedianWidth: 8,
  shoulderWidth: 1.5,
});

export const M7_2_DEFAULT_BRANCHING_FORK: Readonly<M622ParentForkGeometry> = Object.freeze({
  junction: M7_2_DEFAULT_BRANCHING_JUNCTION,
  routeGateS: M7_2_ROUTE_GATE_S,
  handoffSeamS: M7_2_HANDOFF_SEAM_S,
  childContinuation: 'FORWARD_OPEN',
});

export const M7_2_PLAYER_START_L = M7_1_PLAYER_START_L;
export const M7_2_RIVAL_START_L = M7_1_RIVAL_START_L;
export const M7_2_PLAYER_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = M7_1_HIGHWAY_RECOVERY_PROFILE;
export const M7_2_RIVAL_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE;

export interface M72DefaultBranchingParent {
  readonly guide: GuideCurve;
  readonly heightProfile: HeightProfile;
  readonly visualProfile: VisualProfile;
  readonly surfaceMap: SurfaceMap;
  readonly groundProfile: GroundMapProfile;
  readonly terrainProfile: TerrainVisualProfile;
}

/**
 * Default BRANCHING parent stage.
 *
 * The closed M7.1 geometric source is deliberately consumed as one finite ordinary open path.
 * BRANCHING exits through physical gates before the authored endpoint; no wrapping or circuit
 * progress is present in this composition.
 */
export function createM72DefaultBranchingParent(): M72DefaultBranchingParent {
  const guide = compileGuidePath(createM71HighwayCalibrationLapRaster(), {
    lMax: 13,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  const heightProfile = createM72BranchingHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, [{
    sStart: 0,
    name: 'M7.2 DEFAULT FOUR-LANE BRANCHING HIGHWAY',
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
  }]);
  const baseSurface = createM71HighwaySurfaceMap(guide.length);
  const surfaceMap = new SurfaceMap(
    guide.length,
    baseSurface.sections,
    M7_2_DEFAULT_BRANCHING_JUNCTION,
  );
  const groundProfile: GroundMapProfile = {
    ...createM71HighwayGroundProfile(),
    groundLeft: 13,
    groundRight: 13,
    junction: M7_2_DEFAULT_BRANCHING_JUNCTION,
  };
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
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

export function createM72BranchingHeightProfile(courseLength: number): HeightProfile {
  if (!(courseLength > M7_2_HANDOFF_SEAM_S + 500)) {
    throw new RangeError('M7.2 parent Guide must retain runout beyond the first handoff');
  }
  return new HeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: 100, y: 0 },
    { s: 260, y: 9 },
    { s: 350, y: 14 },
    { s: 380, y: -4 },
    { s: 560, y: -4 },
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
