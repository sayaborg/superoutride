import type { SharedRuntimeContent } from './shared-runtime-content.js';
import type { GuidePath } from '../core/guide-curve.js';
import { compileDeclarativeLiveRoute } from '../runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../runtime/raster-fork-stage-route.js';
import type { SpriteAssets } from '../visual/sprite-assets.js';
import { createM635SecondLiveForkAuthoring } from './m6-35-second-live-fork.js';
import { createSecondForkStep } from './second-fork-authoring.js';

/** Focused right terminal promotion with the other authored stages retained. */
function createM637SymmetricSecondLiveForkAuthoring(
  guide: GuidePath,
  parent: SharedRuntimeContent,
  assets: SpriteAssets,
) {
  const upstream = createM635SecondLiveForkAuthoring(guide, parent, assets);
  return compileRasterForkStageRoute({ upstream, ...createSecondForkStep('RIGHT', assets) }).authoring;
}

export function createM637SymmetricSecondLiveForkRuntime(
  guide: GuidePath,
  parent: SharedRuntimeContent,
  assets: SpriteAssets,
) {
  return compileDeclarativeLiveRoute(createM637SymmetricSecondLiveForkAuthoring(guide, parent, assets));
}
