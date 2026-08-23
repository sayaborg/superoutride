import type { FarBackground } from '../visual/far-background.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import type { CourseSprite } from '../world/course-sprite.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import type { CyclicSurfaceMap } from '../physics/surface-map.js';
import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import type { M616ChildGuideCharts } from './m6-16-child-guide-charts.js';
import type { M618StageRoadViews } from './m6-18-stage-road-views.js';

export interface M619SharedRuntimeContent {
  readonly heightProfile: CyclicHeightProfile;
  readonly surfaceMap: CyclicSurfaceMap;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly selectFarBackground: (cameraS: number) => FarBackground;
  readonly worldSprites: readonly CourseSprite[];
}

/**
 * Resolve the M6 DEV route package IDs into concrete runtime packages.
 *
 * The closed DEV fixture reuses one physical fork on multiple passes, so M6.19 deliberately does
 * not install this registry into main.ts yet. It proves the package boundary and atomic handoff
 * selection; a later milestone will author non-reused child-stage content before live switching.
 */
export function createM619DebugStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  charts: M616ChildGuideCharts,
  roadViews: M618StageRoadViews,
  shared: M619SharedRuntimeContent,
): StageRuntimeContentRegistry {
  const parent = makePackage('CONTENT_STAGE_1', charts.parent, null, shared.surfaceMap, manifest, shared);
  const left = (packageId: string): StageRuntimeContentPackage => makePackage(
    packageId,
    charts.left,
    roadViews.left,
    new StageSurfaceMapView(shared.surfaceMap, roadViews.left),
    manifest,
    shared,
  );
  const right = (packageId: string): StageRuntimeContentPackage => makePackage(
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
  shared: M619SharedRuntimeContent,
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
