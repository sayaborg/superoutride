import type { LiveRouteRuntimeAssembly } from '../../runtime/live-route-runtime.js';
import { compileLiveRouteChoicePlan, type LiveRouteChoicePlan } from '../../runtime/live-route-traveler.js';

/**
 * Deterministic DEV rival intent for .
 *
 * This is steering intent only. The rival still has to physically cross each world-space route
 * gate and handoff seam; this list cannot directly advance RouteDag state.
 */
export const RIVAL_ROUTE_CHOICE_IDS = Object.freeze([
  'S1_RIGHT',
  'S2R_CONTINUE',
  'S3R_CONTINUE',
  'S4R_FORK_B',
] as const);

export function createRivalRouteChoicePlan(live: LiveRouteRuntimeAssembly): LiveRouteChoicePlan {
  return compileLiveRouteChoicePlan(live, RIVAL_ROUTE_CHOICE_IDS);
}
