import type { SharedRuntimeContent } from './shared-runtime-content.js';
import type { GuidePath } from '../core/guide-curve.js';
import { compileDeclarativeLiveRoute } from '../runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../runtime/raster-fork-stage-route.js';
import type { SpriteAssets } from '../visual/sprite-assets.js';
import { createM630ThirdLiveSuccessorAuthoring } from './m6-30-third-live-successor.js';
import { createSecondForkStep } from './second-fork-authoring.js';

/** Focused left terminal promotion with the other authored stages retained. */
export function createM635SecondLiveForkAuthoring(
  guide: GuidePath,
  parent: SharedRuntimeContent,
  assets: SpriteAssets,
) {
  const upstream = createM630ThirdLiveSuccessorAuthoring(guide, parent, assets);
  return compileRasterForkStageRoute({ upstream, ...createSecondForkStep('LEFT', assets) }).authoring;
}

export function createM635SecondLiveForkRuntime(guide: GuidePath, parent: SharedRuntimeContent, assets: SpriteAssets) {
  return compileDeclarativeLiveRoute(createM635SecondLiveForkAuthoring(guide, parent, assets));
}
