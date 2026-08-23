import {
  getRouteChoice,
  getRouteStage,
  type RouteDag,
  type ValidatedRouteBoundary,
} from './route-dag.js';

const EPSILON = 1e-9;

export type SharedRouteChoiceMode = 'INDEPENDENT' | 'FIRST_PHYSICAL_CROSSING_LOCKS';

export interface SharedRouteChoiceLock {
  readonly stageId: string;
  readonly choiceId: string;
  readonly lockedByActorId: string;
}

export interface SharedRouteChoiceState {
  readonly mode: SharedRouteChoiceMode;
  readonly locks: SharedRouteChoiceLock[];
}

export interface SharedRouteChoiceCandidate {
  readonly actorId: string;
  readonly activeStageId: string;
  readonly boundary: Extract<ValidatedRouteBoundary, { readonly kind: 'TRANSITION' }>;
  /** Physical gate crossing position within the authoritative physics step, in [0, 1]. */
  readonly crossingFraction: number;
}

export type SharedRouteChoiceDecisionReason =
  | 'INDEPENDENT'
  | 'UNBRANCHED_STAGE'
  | 'LOCK_CREATED'
  | 'MATCHES_EXISTING_LOCK'
  | 'CONFLICTS_WITH_LOCK';

export interface SharedRouteChoiceDecision {
  readonly actorId: string;
  readonly stageId: string;
  readonly choiceId: string;
  readonly accepted: boolean;
  readonly reason: SharedRouteChoiceDecisionReason;
}

export interface SharedRouteChoiceArbitration {
  readonly decisions: readonly SharedRouteChoiceDecision[];
  readonly createdLocks: readonly SharedRouteChoiceLock[];
}

/**
 * Race/session route-choice authority.
 *
 * INDEPENDENT preserves the M6.40 behavior exactly.
 * FIRST_PHYSICAL_CROSSING_LOCKS records one shared choice only for authored branch stages.
 * Single-successor continuation stages remain ordinary per-actor route transactions and do not
 * consume shared-choice state.
 */
export function createSharedRouteChoiceState(
  mode: SharedRouteChoiceMode,
): SharedRouteChoiceState {
  if (mode !== 'INDEPENDENT' && mode !== 'FIRST_PHYSICAL_CROSSING_LOCKS') {
    const exhaustive: never = mode;
    throw new RangeError(`unsupported shared route choice mode: ${String(exhaustive)}`);
  }
  return { mode, locks: [] };
}

export function getSharedRouteChoiceLock(
  state: SharedRouteChoiceState,
  stageId: string,
): SharedRouteChoiceLock | null {
  return state.locks.find((lock) => lock.stageId === stageId) ?? null;
}

/**
 * Resolve all forward physical TRANSITION observations from one simulation tick.
 *
 * Candidates may belong to different route stages because the race field can be spread across
 * the point-to-point course. For each unlocked branching stage, the smallest crossingFraction
 * wins. If two fractions are exactly equal within EPSILON, input order is the deterministic
 * tie-break; callers can therefore pass candidates in their already-established race order.
 *
 * All actors that crossed the winning physical gate in the same tick are accepted. A sibling
 * crossing in that same tick is rejected by shared authority even though it was individually
 * valid physical geometry.
 */
export function arbitrateSharedRouteChoiceCandidates(
  route: RouteDag,
  state: SharedRouteChoiceState,
  candidates: readonly SharedRouteChoiceCandidate[],
): SharedRouteChoiceArbitration {
  const actorIds = new Set<string>();
  for (const candidate of candidates) {
    assertNonEmpty(candidate.actorId, 'shared route actor id');
    if (actorIds.has(candidate.actorId)) {
      throw new RangeError(`shared route actor may submit at most one transition candidate per tick: ${candidate.actorId}`);
    }
    actorIds.add(candidate.actorId);
    if (!Number.isFinite(candidate.crossingFraction)
      || candidate.crossingFraction < 0
      || candidate.crossingFraction > 1) {
      throw new RangeError(`shared route crossing fraction must be within [0,1]: ${candidate.actorId}`);
    }
    const choice = getRouteChoice(route, candidate.boundary.choiceId);
    if (choice.fromStageId !== candidate.activeStageId) {
      throw new RangeError(
        `shared route candidate ${candidate.actorId} choice ${choice.id} does not leave ${candidate.activeStageId}`,
      );
    }
  }

  if (state.mode === 'INDEPENDENT') {
    return Object.freeze({
      decisions: Object.freeze(candidates.map((candidate) => decision(candidate, true, 'INDEPENDENT'))),
      createdLocks: Object.freeze([]),
    });
  }

  const decisions: SharedRouteChoiceDecision[] = [];
  const createdLocks: SharedRouteChoiceLock[] = [];
  const byStage = new Map<string, SharedRouteChoiceCandidate[]>();
  for (const candidate of candidates) {
    const stageCandidates = byStage.get(candidate.activeStageId) ?? [];
    stageCandidates.push(candidate);
    byStage.set(candidate.activeStageId, stageCandidates);
  }

  for (const [stageId, stageCandidates] of byStage) {
    const stage = getRouteStage(route, stageId);
    if (stage.kind !== 'STAGE') {
      throw new RangeError(`terminal stage cannot submit a transition candidate: ${stageId}`);
    }

    if (stage.outgoingChoiceIds.length <= 1) {
      for (const candidate of stageCandidates) {
        decisions.push(decision(candidate, true, 'UNBRANCHED_STAGE'));
      }
      continue;
    }

    let lock = getSharedRouteChoiceLock(state, stageId);
    if (lock === null) {
      let winner = stageCandidates[0]!;
      for (let i = 1; i < stageCandidates.length; i += 1) {
        const candidate = stageCandidates[i]!;
        if (candidate.crossingFraction < winner.crossingFraction - EPSILON) winner = candidate;
      }
      lock = Object.freeze({
        stageId,
        choiceId: winner.boundary.choiceId,
        lockedByActorId: winner.actorId,
      });
      state.locks.push(lock);
      createdLocks.push(lock);

      for (const candidate of stageCandidates) {
        const accepted = candidate.boundary.choiceId === lock.choiceId;
        decisions.push(decision(
          candidate,
          accepted,
          accepted ? 'LOCK_CREATED' : 'CONFLICTS_WITH_LOCK',
        ));
      }
      continue;
    }

    for (const candidate of stageCandidates) {
      const accepted = candidate.boundary.choiceId === lock.choiceId;
      decisions.push(decision(
        candidate,
        accepted,
        accepted ? 'MATCHES_EXISTING_LOCK' : 'CONFLICTS_WITH_LOCK',
      ));
    }
  }

  return Object.freeze({
    decisions: Object.freeze(decisions),
    createdLocks: Object.freeze(createdLocks),
  });
}

/**
 * Return the only legal transition choice for this stage after a shared lock exists.
 * Null means all ordinary authored choices remain eligible for physical observation.
 *
 * The gate set itself is never modified: race/session policy only narrows observation candidates.
 */
export function sharedRouteAllowedTransitionChoiceId(
  route: RouteDag,
  state: SharedRouteChoiceState,
  activeStageId: string,
): string | null {
  if (state.mode === 'INDEPENDENT') return null;
  const stage = getRouteStage(route, activeStageId);
  if (stage.kind !== 'STAGE' || stage.outgoingChoiceIds.length <= 1) return null;
  return getSharedRouteChoiceLock(state, activeStageId)?.choiceId ?? null;
}

export function sharedRouteChoiceAllowsBoundary(
  route: RouteDag,
  state: SharedRouteChoiceState,
  activeStageId: string,
  boundary: ValidatedRouteBoundary | null,
): boolean {
  if (boundary === null || boundary.kind === 'FINISH' || state.mode === 'INDEPENDENT') return true;
  const choice = getRouteChoice(route, boundary.choiceId);
  if (choice.fromStageId !== activeStageId) return false;
  const stage = getRouteStage(route, activeStageId);
  if (stage.outgoingChoiceIds.length <= 1) return true;
  const lock = getSharedRouteChoiceLock(state, activeStageId);
  return lock === null || lock.choiceId === choice.id;
}

function decision(
  candidate: SharedRouteChoiceCandidate,
  accepted: boolean,
  reason: SharedRouteChoiceDecisionReason,
): SharedRouteChoiceDecision {
  return Object.freeze({
    actorId: candidate.actorId,
    stageId: candidate.activeStageId,
    choiceId: candidate.boundary.choiceId,
    accepted,
    reason,
  });
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}
