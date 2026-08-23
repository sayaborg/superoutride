import type { GuideCurve } from '../core/guide-curve.js';
import { createM6DebugRouteStageContentManifest } from '../gameplay/route-stage-content.js';
import {
  compileLiveRouteRuntimeAssembly,
  type LiveRouteRuntimeAssembly,
} from '../runtime/live-route-runtime.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM626LiveContinuation,
  createM626LiveGateSet,
  createM626LiveHandoffManifest,
  createM626LiveRouteDag,
} from './m6-26-live-successor-stage.js';
import { createM626LiveStageRuntimeRegistry } from './m6-26-live-runtime-content.js';

/**
 * M6.27 is the single browser-facing assembly point for the current authored route.
 * main.ts consumes only the compiled generic bundle; M6.26-specific construction stays here.
 */
export function createM627LiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  const route = createM626LiveRouteDag();
  const continuation = createM626LiveContinuation(parentGuide);
  const content = createM6DebugRouteStageContentManifest(route);
  const gates = createM626LiveGateSet(route, continuation);
  const handoffs = createM626LiveHandoffManifest(route, continuation);
  const registry = createM626LiveStageRuntimeRegistry(content, continuation, parentContent, spriteAssets);

  return compileLiveRouteRuntimeAssembly({
    route,
    content,
    charts: continuation.charts,
    gates,
    handoffs,
    registry,
    initialChart: continuation.base.charts.parent,
  });
}
