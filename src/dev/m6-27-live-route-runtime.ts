import type { GuideCurve } from '../core/guide-curve.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM638DeclarativeForkGrowthRuntime } from './m6-38-declarative-fork-growth-plan.js';

/**
 * Browser-facing stable assembly entry point introduced by M6.27.
 *
 * Later milestones keep main.ts unchanged by moving live route evolution behind this single entry.
 * M6.38 expresses the two validated second forks as an ordered data plan folded through the same
 * generic M6.36 compiler; browser gate -> PENDING -> seam COMMIT behavior is unchanged.
 */
export function createM627LiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return createM638DeclarativeForkGrowthRuntime(parentGuide, parentContent, spriteAssets);
}
