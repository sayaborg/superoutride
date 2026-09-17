import { createSharedRouteChoiceState } from '../../dist/gameplay/shared-route-choice-authority.js';
import { advanceLiveRouteMultiActorTick } from '../../dist/runtime/live-route-multi-actor-tick.js';

// One-actor fixture input for the production transaction, with no separate progress implementation.
export function advanceTraveler(live, state, currentWorldPoint) {
  return advanceLiveRouteMultiActorTick(live, createSharedRouteChoiceState('INDEPENDENT'), [
    { actorId: 'TEST_ACTOR', state, currentWorldPoint },
  ]).actors.TEST_ACTOR;
}
