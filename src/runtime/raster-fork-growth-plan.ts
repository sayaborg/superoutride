import type { DeclarativeLiveRouteAuthoring } from './declarative-live-route.js';
import {
  compileRasterForkStageRoute,
  type CompiledRasterForkStageRoute,
  type RasterForkStageRouteAuthoring,
} from './raster-fork-stage-route.js';

/** One terminal -> fork operation with its upstream authoring supplied by the plan fold. */
export type RasterForkGrowthStep = Omit<RasterForkStageRouteAuthoring, 'upstream'>;

export interface CompiledRasterForkGrowthPlan {
  readonly authoring: DeclarativeLiveRouteAuthoring;
  readonly steps: readonly CompiledRasterForkStageRoute[];
}

/**
 * Apply an ordered list of terminal -> fork operations to one declarative route authoring source.
 *
 * This is deliberately only composition. Each step still flows through the complete M6.36
 * compiler, so terminal promotion, visible junction geometry, Raster successor construction,
 * package/chart/world-frame ownership and physical gate/seam/FINISH derivation retain one
 * authority. No route geometry is recomputed here.
 */
export function compileRasterForkGrowthPlan(
  upstream: DeclarativeLiveRouteAuthoring,
  steps: readonly RasterForkGrowthStep[],
): CompiledRasterForkGrowthPlan {
  let authoring = upstream;
  const compiled: CompiledRasterForkStageRoute[] = [];

  for (const step of steps) {
    const result = compileRasterForkStageRoute(Object.freeze({
      ...step,
      upstream: authoring,
    }));
    compiled.push(result);
    authoring = result.authoring;
  }

  return Object.freeze({
    authoring,
    steps: Object.freeze(compiled),
  });
}
