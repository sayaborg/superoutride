import {
  JunctionCrossSectionProfile,
  type JunctionCrossSectionAuthoring,
} from '../course/junction-cross-section.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import {
  StageJunctionSurfaceMap,
  type StageJunctionOuterSurfaceType,
} from '../physics/stage-junction-surface-map.js';
import type { GroundMapProfile } from '../visual/ground-map.js';

export interface StageJunctionSource {
  readonly courseLength: number;
  readonly roadView: StageRoadView;
  readonly groundProfile: GroundMapProfile;
}

export interface StageJunctionAuthoring {
  readonly roadViewId: string;
  readonly surfaceSectionName: string;
  readonly crossSection: JunctionCrossSectionAuthoring;
  readonly outerSurfaceType?: StageJunctionOuterSurfaceType;
}

export interface CompiledStageJunction {
  readonly junction: JunctionCrossSectionProfile;
  readonly roadView: StageRoadView;
  readonly surfaceMap: StageJunctionSurfaceMap;
  readonly groundProfile: GroundMapProfile;
  readonly requiredGroundHalfWidth: number;
}

const EPSILON = 1e-9;

/**
 * Attach one visible two-way JunctionCrossSectionProfile to an arbitrary centered stage chart.
 *
 * The incoming stage remains one Raster road. Only the lateral source envelope is expanded far
 * enough to contain both child roads, the final median and the outer shoulders. No new depth path,
 * route decision, camera rule or renderer primitive is introduced here.
 */
export function compileStageJunction(
  source: StageJunctionSource,
  authoring: StageJunctionAuthoring,
): CompiledStageJunction {
  if (!(source.courseLength > 0) || !Number.isFinite(source.courseLength)) {
    throw new RangeError('stage junction courseLength must be finite and > 0');
  }
  const junction = new JunctionCrossSectionProfile(authoring.crossSection);
  const incomingHalfWidth = authoring.crossSection.parentRoadWidth * 0.5;
  if (
    Math.abs(source.roadView.roadLeft - incomingHalfWidth) > EPSILON
    || Math.abs(source.roadView.roadRight - incomingHalfWidth) > EPSILON
  ) {
    throw new RangeError('stage junction incoming road width must match the active StageRoadView');
  }

  const requiredGroundHalfWidth = authoring.crossSection.childRoadWidth
    + authoring.crossSection.finalMedianWidth * 0.5
    + authoring.crossSection.shoulderWidth;
  const roadView = createStageRoadView({
    ...source.roadView,
    id: authoring.roadViewId,
    groundLeft: Math.max(source.roadView.groundLeft, requiredGroundHalfWidth),
    groundRight: Math.max(source.roadView.groundRight, requiredGroundHalfWidth),
  });
  const groundProfile: GroundMapProfile = Object.freeze({
    ...source.groundProfile,
    groundLeft: Math.max(source.groundProfile.groundLeft, requiredGroundHalfWidth),
    groundRight: Math.max(source.groundProfile.groundRight, requiredGroundHalfWidth),
    roadLeft: incomingHalfWidth,
    roadRight: incomingHalfWidth,
    shoulderWidth: authoring.crossSection.shoulderWidth,
    junction,
  });
  const surfaceMap = new StageJunctionSurfaceMap(
    source.courseLength,
    roadView,
    junction,
    authoring.surfaceSectionName,
    authoring.outerSurfaceType ?? 'GRASS',
  );

  return Object.freeze({
    junction,
    roadView,
    surfaceMap,
    groundProfile,
    requiredGroundHalfWidth,
  });
}
