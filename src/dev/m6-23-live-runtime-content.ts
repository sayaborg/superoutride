import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import type { FarBackground } from '../visual/far-background.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM621ChildVisualIdentity,
  type M621ChildVisualIdentity,
} from './m6-21-child-visual-identity.js';
import type { M622ChildStageContinuation, M622ChildStageRuntimeSource } from './m6-22-child-stage-continuation.js';
import {
  createM623ChildStageScenery,
  type M623ChildStageScenery,
  type M623ChildStageScenerySource,
} from './m6-23-child-stage-scenery.js';

/**
 * M6.23 changes only child presentation ownership. The parent overlap package remains unchanged,
 * and child SurfaceMap/Guide authority remains the already validated M6.22 source.
 */
export function createM623LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
  scenery: M623ChildStageScenery = createM623ChildStageScenery(continuation),
  childVisualIdentity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
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
      scenery.left,
      manifest.worldFrameId,
      childVisualIdentity.leftFarBackground,
    ),
    childPackage(
      'CONTENT_GOAL_R',
      continuation.right,
      scenery.right,
      manifest.worldFrameId,
      childVisualIdentity.rightFarBackground,
    ),
  ]);
}

function childPackage(
  packageId: string,
  source: M622ChildStageRuntimeSource,
  scenery: M623ChildStageScenerySource,
  worldFrameId: string,
  farBackground: FarBackground,
): StageRuntimeContentPackage {
  if (scenery.terrainProfile.height !== scenery.heightProfile) {
    throw new Error(`M6.23 terrain/height authority mismatch: ${packageId}`);
  }
  return {
    packageId,
    worldFrameId,
    coordinateFrame: source.chart,
    roadView: scenery.roadView,
    surfaceMap: source.surfaceMap,
    heightProfile: scenery.heightProfile,
    terrainProfile: scenery.terrainProfile,
    groundProfile: scenery.groundProfile,
    selectFarBackground: () => farBackground,
    worldSprites: scenery.worldSprites,
  };
}
