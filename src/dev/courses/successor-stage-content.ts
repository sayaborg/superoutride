import type { RouteStageContentManifest } from '../../gameplay/route-stage-content.js';
import { compileAuthoredStageRuntimePackage } from '../../runtime/stage-authoring-compiler.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../../runtime/stage-runtime-content.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createChildVisualIdentity, type ChildVisualIdentity } from './child-backgrounds.js';
import { createChildStageAuthoring } from './child-stage-authoring.js';
import type { SharedRuntimeContent } from './shared-runtime-content.js';
import type { LiveContinuation, SuccessorRuntimeSource } from './successor-stage-continuation.js';

/**
 * Compile both intermediate child packages and their successor packages from the same
 * reusable stage-local authoring boundary. Each package is compiled against its own Guide.
 */
export function createSuccessorStageRegistry(
  manifest: RouteStageContentManifest,
  continuation: LiveContinuation,
  parent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  identity: ChildVisualIdentity = createChildVisualIdentity(),
): StageRuntimeContentRegistry {
  return compileStageRuntimeContentRegistry(
    manifest,
    createSuccessorStagePackages(continuation, parent, spriteAssets, manifest.worldFrameId, identity),
  );
}

/**
 * Expose the complete package objects before route/content binding compilation.
 * Declarative route authoring and registry construction share these stage-owned packages.
 */
export function createSuccessorStagePackages(
  continuation: LiveContinuation,
  parent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  worldFrameId: string,
  identity: ChildVisualIdentity = createChildVisualIdentity(),
): readonly StageRuntimeContentPackage[] {
  const authored = createChildStageAuthoring(spriteAssets, identity);
  return Object.freeze([
    parentPackage(worldFrameId, continuation, parent),
    compileAuthoredStageRuntimePackage(
      {
        packageId: 'CONTENT_STAGE_2_L',
        worldFrameId,
        coordinateFrame: continuation.base.left.chart,
        roadView: continuation.base.left.roadView,
        surfaceMap: continuation.base.left.surfaceMap,
        groundProfile: continuation.base.left.groundProfile,
      },
      authored.left,
    ),
    compileAuthoredStageRuntimePackage(
      {
        packageId: 'CONTENT_STAGE_2_R',
        worldFrameId,
        coordinateFrame: continuation.base.right.chart,
        roadView: continuation.base.right.roadView,
        surfaceMap: continuation.base.right.surfaceMap,
        groundProfile: continuation.base.right.groundProfile,
      },
      authored.right,
    ),
    successorPackage('CONTENT_GOAL_L', continuation.leftSuccessor, worldFrameId, authored.left),
    successorPackage('CONTENT_GOAL_R', continuation.rightSuccessor, worldFrameId, authored.right),
  ]);
}

function successorPackage(
  packageId: string,
  source: SuccessorRuntimeSource,
  worldFrameId: string,
  authoring: ReturnType<typeof createChildStageAuthoring>['left'],
): StageRuntimeContentPackage {
  return compileAuthoredStageRuntimePackage(
    {
      packageId,
      worldFrameId,
      coordinateFrame: source.chart,
      roadView: source.roadView,
      surfaceMap: source.surfaceMap,
      groundProfile: source.groundProfile,
    },
    authoring,
  );
}

function parentPackage(
  worldFrameId: string,
  continuation: LiveContinuation,
  parent: SharedRuntimeContent,
): StageRuntimeContentPackage {
  return {
    ...parent,
    packageId: 'CONTENT_STAGE_1',
    worldFrameId,
    coordinateFrame: continuation.base.charts.parent,
    roadView: null,
  };
}
