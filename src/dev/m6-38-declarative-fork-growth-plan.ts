import type { SharedRuntimeContent } from './shared-runtime-content.js';
import type { GuidePath } from '../core/guide-curve.js';
import { compileDeclarativeLiveRoute, type DeclarativeLiveRouteAuthoring } from '../runtime/declarative-live-route.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import { compileRasterForkGrowthPlan, type CompiledRasterForkGrowthPlan } from '../runtime/raster-fork-growth-plan.js';
import type { SpriteAssets } from '../visual/sprite-assets.js';
import { M6_22_PARENT_FORK_GEOMETRY, type M622ParentForkGeometry } from './m6-22-child-stage-continuation.js';
import { createM630ThirdLiveSuccessorAuthoring } from './m6-30-third-live-successor.js';
import { createSecondForkStep } from './second-fork-authoring.js';

/**
 * M6.38 expresses both live second forks as ordered data applied to one M6.30 base authoring.
 * The plan adds no geometry authority: every step still executes the unchanged M6.36 compiler.
 */
export function createM638DeclarativeForkGrowthPlan(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): CompiledRasterForkGrowthPlan {
  const upstream = createM630ThirdLiveSuccessorAuthoring(parentGuide, parentContent, spriteAssets, parentFork);
  return compileRasterForkGrowthPlan(upstream, [
    createSecondForkStep('LEFT', spriteAssets),
    createSecondForkStep('RIGHT', spriteAssets),
  ]);
}

function createM638DeclarativeForkGrowthAuthoring(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): DeclarativeLiveRouteAuthoring {
  return createM638DeclarativeForkGrowthPlan(parentGuide, parentContent, spriteAssets, parentFork).authoring;
}

export function createM638DeclarativeForkGrowthRuntime(
  parentGuide: GuidePath,
  parentContent: SharedRuntimeContent,
  spriteAssets: SpriteAssets,
  parentFork: M622ParentForkGeometry = M6_22_PARENT_FORK_GEOMETRY,
): LiveRouteRuntimeAssembly {
  return compileDeclarativeLiveRoute(
    createM638DeclarativeForkGrowthAuthoring(parentGuide, parentContent, spriteAssets, parentFork),
  );
}
