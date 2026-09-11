import type { RouteStageContentManifest } from '../../gameplay/route-stage-content.js';
import { compileAuthoredStageRuntimePackage } from '../../runtime/stage-authoring-compiler.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../../runtime/stage-runtime-content.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createChildVisualIdentity, type ChildVisualIdentity } from '../courses/child-backgrounds.js';
import { createChildStageAuthoring } from '../courses/child-stage-authoring.js';
import type { ChildStageContinuation } from '../courses/child-stage-continuation.js';
import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';

/**
 * Registry fixture: child package content is produced by the reusable stage authoring compiler.
 * Route selection, handoff authority and renderer behavior are unchanged.
 */
export function createAuthoredStageRegistry(
  manifest: RouteStageContentManifest,
  continuation: ChildStageContinuation,
  parent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  childVisualIdentity: ChildVisualIdentity = createChildVisualIdentity(),
): StageRuntimeContentRegistry {
  const authored = createChildStageAuthoring(spriteAssets, childVisualIdentity);
  return compileStageRuntimeContentRegistry(manifest, [
    parentPackage(manifest, continuation, parent),
    compileAuthoredStageRuntimePackage(
      {
        packageId: 'CONTENT_GOAL_L',
        worldFrameId: manifest.worldFrameId,
        coordinateFrame: continuation.left.chart,
        roadView: continuation.left.roadView,
        surfaceMap: continuation.left.surfaceMap,
        groundProfile: continuation.left.groundProfile,
      },
      authored.left,
    ),
    compileAuthoredStageRuntimePackage(
      {
        packageId: 'CONTENT_GOAL_R',
        worldFrameId: manifest.worldFrameId,
        coordinateFrame: continuation.right.chart,
        roadView: continuation.right.roadView,
        surfaceMap: continuation.right.surfaceMap,
        groundProfile: continuation.right.groundProfile,
      },
      authored.right,
    ),
  ]);
}

function parentPackage(
  manifest: RouteStageContentManifest,
  continuation: ChildStageContinuation,
  parent: SharedRuntimeContent,
): StageRuntimeContentPackage {
  return {
    ...parent,
    packageId: 'CONTENT_STAGE_1',
    worldFrameId: manifest.worldFrameId,
    coordinateFrame: continuation.charts.parent,
    roadView: null,
  };
}
