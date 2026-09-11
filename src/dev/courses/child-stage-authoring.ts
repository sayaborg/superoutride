import { rgba } from '../../graphics/software-surface.js';
import type { StageEnvironmentAuthoring } from '../../runtime/stage-authoring-compiler.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import type { ChildVisualIdentity } from './child-backgrounds.js';

const SHARED_FLAT_END_S = 60;
const CHILD_TERRAIN = Object.freeze({ groundLeft: 12, groundRight: 12, roadLeft: 3.5, roadRight: 3.5 });

export interface ChildStageAuthoring {
  readonly left: StageEnvironmentAuthoring;
  readonly right: StageEnvironmentAuthoring;
}

/**
 * Declarative child-stage content. All sprite lateral coordinates are child-local l values.
 * No parent/source lateral origin appears in the authored data.
 */
export function createChildStageAuthoring(assets: SpriteAssets, identity: ChildVisualIdentity): ChildStageAuthoring {
  return Object.freeze({
    left: Object.freeze({
      terrain: CHILD_TERRAIN,
      farBackground: identity.leftFarBackground,
      heightNodes: Object.freeze([
        { s: 0, y: 0 },
        { s: SHARED_FLAT_END_S, y: 0 },
        { s: 105, y: -1.5 },
        { s: 155, y: 1.0 },
        { s: 215, y: 0 },
        { s: 285, y: 0 },
      ]),
      visualSections: Object.freeze([
        {
          sStart: 0,
          name: 'LEFT_COAST_STAGE',
          groundBaseLeft: { kind: 'color' as const, color: rgba(194, 169, 102) },
          groundBaseRight: { kind: 'color' as const, color: rgba(72, 126, 69) },
        },
      ]),
      sprites: Object.freeze([
        { name: 'COAST_SIGN_1', s: 82, l: 5.2, asset: assets.sign },
        { name: 'COAST_GUARD_1', s: 112, l: -5.0, asset: assets.guardrail },
        { name: 'COAST_GUARD_2', s: 145, l: -5.0, asset: assets.guardrail },
        { name: 'COAST_BUILDING', s: 188, l: 7.0, asset: assets.building },
        { name: 'COAST_GUARD_3', s: 224, l: -5.0, asset: assets.guardrail },
      ]),
    }),
    right: Object.freeze({
      terrain: CHILD_TERRAIN,
      farBackground: identity.rightFarBackground,
      heightNodes: Object.freeze([
        { s: 0, y: 0 },
        { s: SHARED_FLAT_END_S, y: 0 },
        { s: 105, y: 4 },
        { s: 150, y: 9 },
        { s: 195, y: 3 },
        { s: 245, y: 7 },
        { s: 295, y: 0 },
      ]),
      visualSections: Object.freeze([
        {
          sStart: 0,
          name: 'RIGHT_MOUNTAIN_STAGE',
          groundBaseLeft: { kind: 'color' as const, color: rgba(47, 76, 48) },
          groundBaseRight: { kind: 'color' as const, color: rgba(58, 82, 52) },
        },
      ]),
      sprites: Object.freeze([
        { name: 'MOUNTAIN_TREE_1', s: 78, l: -5.3, asset: assets.tree },
        { name: 'MOUNTAIN_TREE_2', s: 101, l: 5.4, asset: assets.tree },
        { name: 'MOUNTAIN_TREE_3', s: 128, l: -5.5, asset: assets.tree },
        { name: 'MOUNTAIN_SIGN', s: 162, l: 5.0, asset: assets.sign },
        { name: 'MOUNTAIN_TREE_4', s: 193, l: 5.6, asset: assets.tree },
        { name: 'MOUNTAIN_TREE_5', s: 226, l: -5.4, asset: assets.tree },
        { name: 'MOUNTAIN_BUILDING', s: 268, l: 7.2, asset: assets.building },
      ]),
    }),
  });
}
