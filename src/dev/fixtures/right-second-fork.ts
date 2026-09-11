import type { GuidePath } from '../../core/guide-curve.js';
import { compileDeclarativeLiveRoute } from '../../runtime/declarative-live-route.js';
import { compileRasterForkStageRoute } from '../../runtime/raster-fork-stage-route.js';
import type { SpriteAssets } from '../../visual/sprite-assets.js';
import { createSecondForkStep } from '../courses/second-fork-authoring.js';
import type { SharedRuntimeContent } from '../courses/shared-runtime-content.js';
import { createSecondLiveForkAuthoring } from './left-second-fork.js';

/** Focused right terminal promotion with the other authored stages retained. */
function createSymmetricSecondLiveForkAuthoring(guide: GuidePath, parent: SharedRuntimeContent, assets: SpriteAssets) {
  const upstream = createSecondLiveForkAuthoring(guide, parent, assets);
  return compileRasterForkStageRoute({ upstream, ...createSecondForkStep('RIGHT', assets) }).authoring;
}

export function createSymmetricSecondLiveForkRuntime(
  guide: GuidePath,
  parent: SharedRuntimeContent,
  assets: SpriteAssets,
) {
  return compileDeclarativeLiveRoute(createSymmetricSecondLiveForkAuthoring(guide, parent, assets));
}
