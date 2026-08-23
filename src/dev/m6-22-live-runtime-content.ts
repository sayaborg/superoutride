import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileStageRuntimeContentRegistry,
  type StageRuntimeContentPackage,
  type StageRuntimeContentRegistry,
} from '../runtime/stage-runtime-content.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM621ChildVisualIdentity,
  type M621ChildVisualIdentity,
} from './m6-21-child-visual-identity.js';
import type {
  M622ChildStageContinuation,
  M622ChildStageRuntimeSource,
} from './m6-22-child-stage-continuation.js';

/**
 * M6.22 keeps the parent overlap package unchanged, but committed children now own independent
 * Raster/Guide geometry and local physical/visual content. Parent world sprites are deliberately
 * not copied into child packages because their chainage belongs to the parent course domain.
 */
export function createM622LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
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
      manifest.worldFrameId,
      childVisualIdentity.leftFarBackground,
    ),
    childPackage(
      'CONTENT_GOAL_R',
      continuation.right,
      manifest.worldFrameId,
      childVisualIdentity.rightFarBackground,
    ),
  ]);
}

function childPackage(
  packageId: string,
  source: M622ChildStageRuntimeSource,
  worldFrameId: string,
  farBackground: ReturnType<typeof createM621ChildVisualIdentity>['leftFarBackground'],
): StageRuntimeContentPackage {
  return {
    packageId,
    worldFrameId,
    coordinateFrame: source.chart,
    roadView: source.roadView,
    surfaceMap: source.surfaceMap,
    heightProfile: source.heightProfile,
    terrainProfile: source.terrainProfile,
    groundProfile: source.groundProfile,
    selectFarBackground: () => farBackground,
    worldSprites: [],
  };
}
