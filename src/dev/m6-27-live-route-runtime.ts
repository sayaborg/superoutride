import type { GuideCurve } from '../core/guide-curve.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM628DeclarativeLiveRouteRuntime } from './m6-28-declarative-live-route.js';

/**
 * Browser-facing stable assembly entry point introduced by M6.27.
 *
 * M6.28 moves the current route definition behind declarative stage/transition/finish authoring,
 * so main.ts remains unchanged while route construction becomes data-driven.
 */
export function createM627LiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return createM628DeclarativeLiveRouteRuntime(parentGuide, parentContent, spriteAssets);
}
