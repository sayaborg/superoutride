import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';

import type { RouteStageContentManifest } from '../../gameplay/route-stage-content.js';

import { StageSurfaceMapView } from '../../physics/stage-surface-map-view.js';

import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../../runtime/stage-runtime-content.js';

import type { ChildGuideCharts } from '../courses/child-guide-charts.js';
import type { StageRoadViews } from './stage-road-views.js';

/** Assemble a shared-source registry to exercise package selection and atomic chart handoff. */
export function createSharedSourceStageRegistry(
  manifest: RouteStageContentManifest,
  charts: ChildGuideCharts,
  roadViews: StageRoadViews,
  shared: SharedRuntimeContent,
): StageRuntimeContentRegistry {
  const parent = makePackage('CONTENT_STAGE_1', charts.parent, null, shared.surfaceMap, manifest, shared);
  const left = (packageId: string): StageRuntimeContentPackage =>
    makePackage(
      packageId,
      charts.left,
      roadViews.left,
      new StageSurfaceMapView(shared.surfaceMap, roadViews.left),
      manifest,
      shared,
    );
  const right = (packageId: string): StageRuntimeContentPackage =>
    makePackage(
      packageId,
      charts.right,
      roadViews.right,
      new StageSurfaceMapView(shared.surfaceMap, roadViews.right),
      manifest,
      shared,
    );

  return compileStageRuntimeContentRegistry(manifest, [
    parent,
    left('CONTENT_STAGE_2_L'),
    right('CONTENT_STAGE_2_R'),
    left('CONTENT_GOAL_LL'),
    right('CONTENT_GOAL_LR'),
    left('CONTENT_GOAL_RL'),
    right('CONTENT_GOAL_RR'),
  ]);
}

function makePackage(
  packageId: string,
  coordinateFrame: StageRuntimeContentPackage['coordinateFrame'],
  roadView: StageRuntimeContentPackage['roadView'],
  surfaceMap: StageRuntimeContentPackage['surfaceMap'],
  manifest: RouteStageContentManifest,
  shared: SharedRuntimeContent,
): StageRuntimeContentPackage {
  return {
    packageId,
    worldFrameId: manifest.worldFrameId,
    coordinateFrame,
    roadView,
    surfaceMap,
    heightProfile: shared.heightProfile,
    terrainProfile: shared.terrainProfile,
    groundProfile: shared.groundProfile,
    selectFarBackground: shared.selectFarBackground,
    worldSprites: shared.worldSprites,
  };
}
