import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM621ChildVisualIdentity,
  type M621ChildVisualIdentity,
} from './m6-21-child-visual-identity.js';
import type {
  M622ChildStageContinuation,
  M622ChildStageRuntimeSource,
} from './m6-22-child-stage-continuation.js';
import {
  createM623ChildEnvironmentContent,
  type M623ChildEnvironment,
} from './m6-23-child-environment-content.js';

/**
 * M6.23 composes independent child geometry (M6.22) with package-owned environment content.
 * Renderer Core still receives only one resolved StageRuntimeContentPackage.
 */
export function createM623LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
  childVisualIdentity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  const environment = createM623ChildEnvironmentContent(continuation, spriteAssets);
  return compileStageRuntimeContentRegistry(manifest, [
    {
      packageId: 'CONTENT_STAGE_1',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: continuation.charts.parent,
      roadView: null,
      surfaceMap: parent.surfaceMap,
      heightProfile: parent.heightProfile,
      terrainProfile: parent.terrainProfile,
      groundProfile: parent.groundProfile,
      selectFarBackground: parent.selectFarBackground,
      worldSprites: parent.worldSprites,
    },
    childPackage(
      'CONTENT_GOAL_L',
      continuation.left,
      environment.left,
      manifest.worldFrameId,
      childVisualIdentity.leftFarBackground,
    ),
    childPackage(
      'CONTENT_GOAL_R',
      continuation.right,
      environment.right,
      manifest.worldFrameId,
      childVisualIdentity.rightFarBackground,
    ),
  ]);
}

function childPackage(
  packageId: string,
  source: M622ChildStageRuntimeSource,
  environment: M623ChildEnvironment,
  worldFrameId: string,
  farBackground: ReturnType<typeof createM621ChildVisualIdentity>['leftFarBackground'],
): StageRuntimeContentPackage {
  return {
    packageId,
    worldFrameId,
    coordinateFrame: source.chart,
    roadView: source.roadView,
    surfaceMap: source.surfaceMap,
    heightProfile: environment.heightProfile,
    terrainProfile: environment.terrainProfile,
    groundProfile: source.groundProfile,
    selectFarBackground: () => farBackground,
    worldSprites: environment.worldSprites,
  };
}
