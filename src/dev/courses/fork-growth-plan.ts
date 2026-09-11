import type { GuidePath } from '../../core/guide-curve.js';
import {
  compileDeclarativeLiveRoute,
  type DeclarativeLiveRouteAuthoring,
} from '../../runtime/declarative-live-route.js';
import type { LiveRouteRuntimeAssembly } from '../../runtime/live-route-runtime.js';
import {
  compileRasterForkGrowthPlan,
  type CompiledRasterForkGrowthPlan,
} from '../../runtime/raster-fork-growth-plan.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { PARENT_FORK_GEOMETRY, type ParentForkGeometry } from './child-stage-continuation.js';
import { createSecondForkStep } from './second-fork-authoring.js';
import type { SharedRuntimeContent } from './shared-runtime-content.js';
import { createThirdLiveSuccessorAuthoring } from './third-successor-route.js';

/**
 * Express both live second forks as ordered data applied to one base authoring.
 * The plan adds no geometry authority: every step still executes the unchanged compiler.
 */
export function createDeclarativeForkGrowthPlan(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): CompiledRasterForkGrowthPlan {
  const upstream = createThirdLiveSuccessorAuthoring(parentGuide, parentContent, spriteAssets, parentFork);
  return compileRasterForkGrowthPlan(upstream, [
    createSecondForkStep('LEFT', spriteAssets),
    createSecondForkStep('RIGHT', spriteAssets),
  ]);
}

function createDeclarativeForkGrowthAuthoring(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): DeclarativeLiveRouteAuthoring {
  return createDeclarativeForkGrowthPlan(parentGuide, parentContent, spriteAssets, parentFork).authoring;
}

export function createDeclarativeForkGrowthRuntime(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: ParentForkGeometry = PARENT_FORK_GEOMETRY,
): LiveRouteRuntimeAssembly {
  return compileDeclarativeLiveRoute(
    createDeclarativeForkGrowthAuthoring(parentGuide, parentContent, spriteAssets, parentFork),
  );
}
