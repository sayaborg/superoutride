import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import type { StageRuntimeContentRegistry } from '../runtime/stage-runtime-content.js';
import { createM4SpriteAssets } from '../visual/m4-sprite-assets.js';
import type { M620SharedRuntimeContent } from './m6-20-live-runtime-content.js';
import {
  createM621ChildVisualIdentity,
  type M621ChildVisualIdentity,
} from './m6-21-child-visual-identity.js';
import type { M622ChildStageContinuation } from './m6-22-child-stage-continuation.js';
import { createM623LiveStageRuntimeRegistry } from './m6-23-live-runtime-content.js';

/**
 * Compatibility entry point retained for the browser wiring established in M6.22.
 * M6.23 enriches committed child packages with their own height/terrain/sprite content while
 * preserving the same route/runtime boundary and parent overlap package.
 */
export function createM622LiveStageRuntimeRegistry(
  manifest: RouteStageContentManifest,
  continuation: M622ChildStageContinuation,
  parent: M620SharedRuntimeContent,
  childVisualIdentity: M621ChildVisualIdentity = createM621ChildVisualIdentity(),
): StageRuntimeContentRegistry {
  return createM623LiveStageRuntimeRegistry(
    manifest,
    continuation,
    parent,
    createM4SpriteAssets(),
    childVisualIdentity,
  );
}
