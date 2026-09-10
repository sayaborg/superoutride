import { uniqueKey } from '../core/validation.js';
import {
  type DeclarativeLiveRouteAuthoring,
  type DeclarativeLiveRouteFinishAuthoring,
  type DeclarativeLiveRouteStageAuthoring,
  type DeclarativeLiveRouteTransitionAuthoring,
} from './declarative-live-route.js';

/**
 * One independently authored piece of a larger declarative point-to-point route.
 *
 * Fragments may intentionally repeat a shared stage row when they attach to the same stage, but
 * that repeated row must be byte-semantic identity: same id, same kind and the exact same runtime
 * object. Edges and physical geometry ids are never mergeable.
 */
export interface DeclarativeRouteFragment {
  readonly stages?: readonly DeclarativeLiveRouteStageAuthoring[];
  readonly transitions?: readonly DeclarativeLiveRouteTransitionAuthoring[];
  readonly finishes?: readonly DeclarativeLiveRouteFinishAuthoring[];
}

export interface DeclarativeRouteFragmentComposition {
  readonly startStageId: string;
  readonly fragments: readonly DeclarativeRouteFragment[];
}

/**
 * Compose route fragments into the declarative-live-route authority.
 *
 * This layer only canonicalizes repeated shared stage rows and rejects cross-fragment identity
 * collisions before the ordinary RouteDag/content/gate/handoff compilers run.
 */
export function composeDeclarativeLiveRouteAuthoring(
  source: DeclarativeRouteFragmentComposition,
): DeclarativeLiveRouteAuthoring {
  if (source.startStageId.length === 0) throw new RangeError('route fragment composition requires a startStageId');
  if (source.fragments.length === 0) throw new RangeError('route fragment composition requires at least one fragment');

  const stages: DeclarativeLiveRouteStageAuthoring[] = [];
  const stageById = new Map<string, DeclarativeLiveRouteStageAuthoring>();
  const transitions: DeclarativeLiveRouteTransitionAuthoring[] = [];
  const transitionIds = new Set<string>();
  const physicalGeometryIds = new Set<string>();
  const finishes: DeclarativeLiveRouteFinishAuthoring[] = [];
  const finishStageIds = new Set<string>();

  for (const fragment of source.fragments) {
    for (const stage of fragment.stages ?? []) {
      const existing = stageById.get(stage.id);
      if (existing) {
        if (existing.kind !== stage.kind || existing.runtime !== stage.runtime) {
          throw new RangeError(`conflicting declarative route fragment stage: ${stage.id}`);
        }
        continue;
      }
      stageById.set(stage.id, stage);
      stages.push(stage);
    }

    for (const transition of fragment.transitions ?? []) {
      uniqueKey(transitionIds, transition.id, 'declarative route fragment transition id');
      uniqueKey(physicalGeometryIds, transition.gate.id, 'declarative route fragment physical gate/handoff id');
      uniqueKey(physicalGeometryIds, transition.handoff.id, 'declarative route fragment physical gate/handoff id');
      transitions.push(transition);
    }

    for (const finish of fragment.finishes ?? []) {
      uniqueKey(finishStageIds, finish.stageId, 'declarative route fragment finish stage id');
      uniqueKey(physicalGeometryIds, finish.gate.id, 'declarative route fragment physical gate/handoff id');
      finishes.push(finish);
    }
  }

  if (!stageById.has(source.startStageId)) {
    throw new RangeError(`route fragment start stage is not authored: ${source.startStageId}`);
  }

  return Object.freeze({
    startStageId: source.startStageId,
    stages: Object.freeze(stages),
    transitions: Object.freeze(transitions),
    finishes: Object.freeze(finishes),
  });
}
