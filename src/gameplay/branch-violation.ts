import type { Vec2 } from '../core/math.js';
import type { RouteBoundaryGateSet, RouteTransitionGate } from './route-boundary-gates.js';

export interface LockedBranchRecoveryApproach {
  readonly choiceId: string;
  readonly worldPoint: Vec2;
}

/**
 * Derive one recovery point immediately before the already-authorized transition gate.
 *
 * The route gate is the authority for where the legal branch physically is. This helper does not
 * inspect renderer state, screen position, AI intent or vehicle physics; it merely walks backward
 * along the gate tangent by an explicit gameplay distance.
 */
export function lockedBranchRecoveryApproach(
  gates: RouteBoundaryGateSet,
  lockedChoiceId: string,
  backtrackDistance: number,
): LockedBranchRecoveryApproach {
  if (typeof lockedChoiceId !== 'string' || lockedChoiceId.trim().length === 0) {
    throw new RangeError('locked branch recovery choice id must be non-empty');
  }
  if (!Number.isFinite(backtrackDistance) || backtrackDistance < 0) {
    throw new RangeError('locked branch recovery backtrack distance must be finite and >= 0');
  }

  const gate = gates.gates.find(
    (candidate): candidate is RouteTransitionGate =>
      candidate.kind === 'TRANSITION' && candidate.choiceId === lockedChoiceId,
  );
  if (!gate) throw new Error(`locked branch recovery gate is missing: ${lockedChoiceId}`);

  return Object.freeze({
    choiceId: lockedChoiceId,
    worldPoint: Object.freeze({
      x: gate.center.x - gate.tangent.x * backtrackDistance,
      z: gate.center.z - gate.tangent.z * backtrackDistance,
    }),
  });
}