import type { RouteStageContentManifest } from '../../gameplay/route-stage-content.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../../runtime/stage-runtime-content.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createChildVisualIdentity, type ChildVisualIdentity } from '../courses/child-backgrounds.js';
import type { ChildStageContinuation, ChildStageRuntimeSource } from '../courses/child-stage-continuation.js';
import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';
import {
  createChildEnvironmentContent,
  type ChildEnvironment,
  type ChildEnvironmentContent,
} from './child-environment.js';

/**
 * Compose independent child geometry with package-owned environment content.
 * Renderer Core still receives only one resolved StageRuntimeContentPackage.
 */
export function createChildEnvironmentStageRegistry(
  manifest: RouteStageContentManifest,
  continuation: ChildStageContinuation,
  parent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  childVisualIdentity: ChildVisualIdentity = createChildVisualIdentity(),
  environment: ChildEnvironmentContent = createChildEnvironmentContent(continuation, spriteAssets),
): StageRuntimeContentRegistry {
  return compileStageRuntimeContentRegistry(manifest, [
    {
      ...parent,
      packageId: 'CONTENT_STAGE_1',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: continuation.charts.parent,
      roadView: null,
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
  source: ChildStageRuntimeSource,
  environment: ChildEnvironment,
  worldFrameId: string,
  farBackground: ReturnType<typeof createChildVisualIdentity>['leftFarBackground'],
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
