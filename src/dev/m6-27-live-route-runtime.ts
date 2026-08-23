import type { GuideCurve } from '../core/guide-curve.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import { createM630ThirdLiveSuccessorRuntime } from './m6-30-third-live-successor.js';

/**
 * Browser-facing stable assembly entry point introduced by M6.27.
 *
 * Later milestones keep main.ts unchanged by moving live route evolution behind this single entry.
 * M6.30 extends the LEFT path by one additional independently generated successor stage using the
 * reusable M6.29 Raster successor factory plus the M6.28 declarative route compiler.
 */
export function createM627LiveRouteRuntime(
  parentGuide: GuideCurve,
  parentContent: M620SharedRuntimeContent,
  spriteAssets: M4SpriteAssets,
): LiveRouteRuntimeAssembly {
  return createM630ThirdLiveSuccessorRuntime(parentGuide, parentContent, spriteAssets);
}
