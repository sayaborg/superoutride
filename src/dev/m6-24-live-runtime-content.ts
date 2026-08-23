import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import { compileAuthoredStageRuntimePackage } from '../runtime/stage-authoring-compiler.js';
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
import type { M622ChildStageContinuation } from './m6-22-child-stage-continuation.js';
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';

/**
 * M6.24 browser runtime: child package content is produced by the reusable stage authoring compiler.
 * Route selection, handoff authority and renderer behavior are unchanged.
 */
export function createM624LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
  childVisualIdentity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  const authored = createM624ChildStageAuthoring(spriteAssets, childVisualIdentity);
  return compileStageRuntimeContentRegistry(manifest, [
    parentPackage(manifest, continuation, parent),
    compileAuthoredStageRuntimePackage({
      packageId: 'CONTENT_GOAL_L',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: continuation.left.chart,
      roadView: continuation.left.roadView,
      surfaceMap: continuation.left.surfaceMap,
      groundProfile: continuation.left.groundProfile,
    }, authored.left),
    compileAuthoredStageRuntimePackage({
      packageId: 'CONTENT_GOAL_R',
      worldFrameId: manifest.worldFrameId,
      coordinateFrame: continuation.right.chart,
      roadView: continuation.right.roadView,
      surfaceMap: continuation.right.surfaceMap,
      groundProfile: continuation.right.groundProfile,
    }, authored.right),
  ]);
}

function parentPackage(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
): StageRuntimeContentPackage {
  return {
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
  };
}
