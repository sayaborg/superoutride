import type { GuideCurve } from '../core/guide-curve.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM635SecondLiveForkRuntime } from './m6-35-second-live-fork.js';

/**
 * Browser-facing stable assembly entry point introduced by M6.27.
 *
 * Later milestones keep main.ts unchanged by moving live route evolution behind this single entry.
 * M6.35 promotes the previous LEFT terminal into a second visible physical fork while preserving
 * the same generic gate -> PENDING -> seam COMMIT browser transaction.
 */
export function createM627LiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return createM635SecondLiveForkRuntime(parentGuide, parentContent, spriteAssets);
}
