import {
  compileStageEnvironment,
  type CompiledStageEnvironment,
  type StageEnvironmentAssetLibrary,
  type StageEnvironmentAuthoring,
} from '../compiler/stage-environment-compiler.js';
import { rgba } from '../render/software-surface.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M622ChildStageContinuation } from './m6-22-child-stage-continuation.js';

const SHARED_FLAT_END_S = 60;

export type M623ChildEnvironment = CompiledStageEnvironment;

export interface M623ChildEnvironmentContent {
  readonly left: M623ChildEnvironment;
  readonly right: M623ChildEnvironment;
}

/**
 * M6.23 content remains the same fixture, but M6.24 makes it authored data compiled through the
 * reusable stage-environment boundary instead of constructing runtime profiles directly here.
 */
export function createM623ChildEnvironmentContent(
  continuation: M622ChildStageContinuation,
  assets: M4SpriteAssets,
): M623ChildEnvironmentContent {
  if (!(continuation.handoffLocalS + 5 < SHARED_FLAT_END_S)) {
    throw new Error('M6.23 child scenery must begin after the D_cam handoff neighborhood');
  }

  const assetLibrary: StageEnvironmentAssetLibrary = Object.freeze({
    tree: assets.tree,
    sign: assets.sign,
    guardrail: assets.guardrail,
    building: assets.building,
  });

  return Object.freeze({
    left: compileStageEnvironment(continuation.left, createCoastAuthoring(continuation.left.guide.length), assetLibrary),
    right: compileStageEnvironment(continuation.right, createMountainAuthoring(continuation.right.guide.length), assetLibrary),
  });
}

export function createM623ChildEnvironmentAuthoring(
  continuation: M622ChildStageContinuation,
): { readonly left: StageEnvironmentAuthoring; readonly right: StageEnvironmentAuthoring } {
  return Object.freeze({
    left: createCoastAuthoring(continuation.left.guide.length),
    right: createMountainAuthoring(continuation.right.guide.length),
  });
}

function createCoastAuthoring(courseLength: number): StageEnvironmentAuthoring {
  return Object.freeze({
    id: 'LEFT_COAST_STAGE',
    heightNodes: Object.freeze([
      { s: 0, y: 0 },
      { s: SHARED_FLAT_END_S, y: 0 },
      { s: 105, y: -1.5 },
      { s: 155, y: 1.0 },
      { s: 215, y: 0 },
      { s: Math.min(courseLength - 1, 285), y: 0 },
    ]),
    visualSections: Object.freeze([{
      sStart: 0,
      name: 'LEFT_COAST_STAGE',
      groundBaseLeft: { kind: 'color', color: rgba(194, 169, 102) },
      groundBaseRight: { kind: 'color', color: rgba(72, 126, 69) },
    }]),
    terrain: terrainAuthoring(),
    sprites: Object.freeze([
      { name: 'COAST_SIGN_1', s: 82, l: 5.2, assetId: 'sign' },
      { name: 'COAST_GUARD_1', s: 112, l: -5.0, assetId: 'guardrail' },
      { name: 'COAST_GUARD_2', s: 145, l: -5.0, assetId: 'guardrail' },
      { name: 'COAST_BUILDING', s: 188, l: 7.0, assetId: 'building' },
      { name: 'COAST_GUARD_3', s: 224, l: -5.0, assetId: 'guardrail' },
    ]),
  });
}

function createMountainAuthoring(courseLength: number): StageEnvironmentAuthoring {
  return Object.freeze({
    id: 'RIGHT_MOUNTAIN_STAGE',
    heightNodes: Object.freeze([
      { s: 0, y: 0 },
      { s: SHARED_FLAT_END_S, y: 0 },
      { s: 105, y: 4 },
      { s: 150, y: 9 },
      { s: 195, y: 3 },
      { s: 245, y: 7 },
      { s: Math.min(courseLength - 1, 295), y: 0 },
    ]),
    visualSections: Object.freeze([{
      sStart: 0,
      name: 'RIGHT_MOUNTAIN_STAGE',
      groundBaseLeft: { kind: 'color', color: rgba(47, 76, 48) },
      groundBaseRight: { kind: 'color', color: rgba(58, 82, 52) },
    }]),
    terrain: terrainAuthoring(),
    sprites: Object.freeze([
      { name: 'MOUNTAIN_TREE_1', s: 78, l: -5.3, assetId: 'tree' },
      { name: 'MOUNTAIN_TREE_2', s: 101, l: 5.4, assetId: 'tree' },
      { name: 'MOUNTAIN_TREE_3', s: 128, l: -5.5, assetId: 'tree' },
      { name: 'MOUNTAIN_SIGN', s: 162, l: 5.0, assetId: 'sign' },
      { name: 'MOUNTAIN_TREE_4', s: 193, l: 5.6, assetId: 'tree' },
      { name: 'MOUNTAIN_TREE_5', s: 226, l: -5.4, assetId: 'tree' },
      { name: 'MOUNTAIN_BUILDING', s: 268, l: 7.2, assetId: 'building' },
    ]),
  });
}

function terrainAuthoring(): StageEnvironmentAuthoring['terrain'] {
  return Object.freeze({
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 3.5,
    roadRight: 3.5,
    thinSpanScreenRows: 1,
  });
}
