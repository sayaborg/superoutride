import type { GuidePath } from '../../core/guide-curve.js';
import { compileDeclarativeLiveRoute } from '../../runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../../runtime/raster-fork-stage-route.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createSecondForkStep } from '../courses/second-fork-authoring.js';
import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';
import { createThirdLiveSuccessorAuthoring } from '../courses/third-successor-route.js';

/** Focused left terminal promotion with the other authored stages retained. */
export function createSecondLiveForkAuthoring(guide: GuidePath, parent: SharedRuntimeContent, assets: SpriteAssets) {
  const upstream = createThirdLiveSuccessorAuthoring(guide, parent, assets);
  return compileRasterForkStageRoute({ upstream, ...createSecondForkStep('LEFT', assets) }).authoring;
}

export function createSecondLiveForkRuntime(guide: GuidePath, parent: SharedRuntimeContent, assets: SpriteAssets) {
  return compileDeclarativeLiveRoute(createSecondLiveForkAuthoring(guide, parent, assets));
}
