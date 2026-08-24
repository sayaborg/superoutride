import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import type { SurfaceMap } from '../physics/surface-map.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import type { FarBackground } from '../visual/far-background.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { CourseSprite } from '../world/course-sprite.js';
import type { M616ChildGuideCharts } from './m6-16-child-guide-charts.js';
import type { M618StageRoadViews } from './m6-18-stage-road-views.js';
import {
  createM621ChildVisualIdentity,
  type M621ChildVisualIdentity,
} from './m6-21-child-visual-identity.js';

export interface M620SharedRuntimeContent {
  readonly heightProfile: HeightProfileReader;
  readonly surfaceMap: SurfaceMap;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly selectFarBackground: (cameraS: number) => FarBackground;
  readonly worldSprites: readonly CourseSprite[];
}

export function createM620LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  charts: M616ChildGuideCharts,
  roadViews: M618StageRoadViews,
  shared: M620SharedRuntimeContent,
  childVisualIdentity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  const packages: StageRuntimeContentPackage[] = [
    {
      packageId: 'CONTENT_STAGE_1',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: charts.parent,
      roadView: null,
      surfaceMap: shared.surfaceMap,
      heightProfile: shared.heightProfile,
      terrainProfile: shared.terrainProfile,
      groundProfile: shared.groundProfile,
      selectFarBackground: shared.selectFarBackground,
      worldSprites: shared.worldSprites,
    },
    childPackage(
      'CONTENT_GOAL_L',
      charts.left,
      roadViews.left,
      new StageSurfaceMapView(shared.surfaceMap, roadViews.left),
      manifest.worldFrameId,
      shared,
      childVisualIdentity.leftFarBackground,
    ),
    childPackage(
      'CONTENT_GOAL_R',
      charts.right,
      roadViews.right,
      new StageSurfaceMapView(shared.surfaceMap, roadViews.right),
      manifest.worldFrameId,
      shared,
      childVisualIdentity.rightFarBackground,
    ),
  ];

  return compileStageRuntimeContentRegistry(manifest, packages);
}

function childPackage(
  packageId: string,
  coordinateFrame: StageRuntimeContentPackage['coordinateFrame'],
  roadView: NonNullable<StageRuntimeContentPackage['roadView']>,
  surfaceMap: StageRuntimeContentPackage['surfaceMap'],
  worldFrameId: string,
  shared: M620SharedRuntimeContent,
  farBackground: FarBackground,
): StageRuntimeContentPackage {
  return {
    packageId,
    worldFrameId,
    coordinateFrame,
    roadView,
    surfaceMap,
    heightProfile: shared.heightProfile,
    terrainProfile: shared.terrainProfile,
    groundProfile: shared.groundProfile,
    selectFarBackground: () => farBackground,
    worldSprites: shared.worldSprites,
  };
}
