import {
  compileLiveRouteChoicePlan,
  type LiveRouteChoicePlan,
} from '../runtime/live-route-traveler.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';

/**
 * Deterministic DEV rival intent for M6.40.
 *
 * This is steering intent only. The rival still has to physically cross each world-space route
 * gate and handoff seam; this list cannot directly advance RouteDag state.
 */
export const M6_40_RIVAL_ROUTE_CHOICE_IDS = Object.freeze([
  'S1_RIGHT',
  'S2R_CONTINUE',
  'S3R_CONTINUE',
  'S4R_FORK_B',
] as const);

export function createM640RivalRouteChoicePlan(
  live: LiveRouteRuntimeAssembly,
): LiveRouteChoicePlan {
  return compileLiveRouteChoicePlan(live, M6_40_RIVAL_ROUTE_CHOICE_IDS);
}
