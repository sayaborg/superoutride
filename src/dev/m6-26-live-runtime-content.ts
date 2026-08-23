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
import { createM624ChildStageAuthoring } from './m6-24-stage-authoring.js';
import type { M626LiveContinuation, M626SuccessorRuntimeSource } from './m6-26-live-successor-stage.js';

/**
 * M6.26 compiles both intermediate child packages and their successor packages from the same
 * reusable M6.24 stage-local authoring boundary. Each package is compiled against its own Guide.
 */
export function createM626LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M626LiveContinuation,
  parent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
  identity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  return compileStageRuntimeContentRegistry(
    manifest,
    createM626LiveStageRuntimePackages(
      continuation,
      parent,
      spriteAssets,
      manifest.worldFrameId,
      identity,
    ),
  );
}

/**
 * Expose the complete package objects before route/content binding compilation.
 * M6.28 uses these as stage-owned values in declarative route authoring; legacy M6.26 registry
 * construction remains a thin wrapper around the same package source.
 */
export function createM626LiveStageRuntimePackages(
  continuation: M626LiveContinuation,
  parent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
  worldFrameId: string,
  identity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): readonly StageRuntimeContentPackage[] {
  const authored = createM624ChildStageAuthoring(spriteAssets, identity);
  return Object.freeze([
    parentPackage(worldFrameId, continuation, parent),
    compileAuthoredStageRuntimePackage({
      packageId: 'CONTENT_STAGE_2_L',
      worldFrameId,
      coordinateFrame: continuation.base.left.chart,
      roadView: continuation.base.left.roadView,
      surfaceMap: continuation.base.left.surfaceMap,
      groundProfile: continuation.base.left.groundProfile,
    }, authored.left),
    compileAuthoredStageRuntimePackage({
      packageId: 'CONTENT_STAGE_2_R',
      worldFrameId,
      coordinateFrame: continuation.base.right.chart,
      roadView: continuation.base.right.roadView,
      surfaceMap: continuation.base.right.surfaceMap,
      groundProfile: continuation.base.right.groundProfile,
    }, authored.right),
    successorPackage('CONTENT_GOAL_L', continuation.leftSuccessor, worldFrameId, authored.left),
    successorPackage('CONTENT_GOAL_R', continuation.rightSuccessor, worldFrameId, authored.right),
  ]);
}

function successorPackage(
  packageId: string,
  source: M626SuccessorRuntimeSource,
  worldFrameId: string,
  authoring: ReturnType<typeof createM624ChildStageAuthoring>['left'],
): StageRuntimeContentPackage {
  return compileAuthoredStageRuntimePackage({
    packageId,
    worldFrameId,
    coordinateFrame: source.chart,
    roadView: source.roadView,
    surfaceMap: source.surfaceMap,
    groundProfile: source.groundProfile,
  }, authoring);
}

function parentPackage(
  worldFrameId: string,
  continuation: M626LiveContinuation,
  parent: M620SharedRuntimeContent,
): StageRuntimeContentPackage {
  return {
    packageId: 'CONTENT_STAGE_1',
    worldFrameId,
    coordinateFrame: continuation.base.charts.parent,
    roadView: null,
    surfaceMap: parent.surfaceMap,
    heightProfile: parent.heightProfile,
    terrainProfile: parent.terrainProfile,
    groundProfile: parent.groundProfile,
    selectFarBackground: parent.selectFarBackground,
    worldSprites: parent.worldSprites,
  };
}
