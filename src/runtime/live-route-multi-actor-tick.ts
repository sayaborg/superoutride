import type { Vec2 } from '../core/math.js';
import {
  observeRouteBoundaryCrossing,
  type RouteBoundaryObservation,
} from '../gameplay/route-boundary-gates.js';
import {
  arbitrateSharedRouteChoiceCandidates,
  getSharedRouteChoiceLock,
  sharedRouteAllowedTransitionChoiceId,
  type SharedRouteChoiceArbitration,
  type SharedRouteChoiceCandidate,
  type SharedRouteChoiceDecision,
  type SharedRouteChoiceState,
} from '../gameplay/shared-route-choice-authority.js';
import {
  updateRouteDag,
  type RouteDagUpdate,
  type ValidatedRouteBoundary,
} from '../gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
  syncRouteStageHandoffCoordinate,
  type RouteStageHandoffEvent,
} from '../gameplay/route-stage-handoff.js';
import type { LiveRouteRuntimeAssembly } from './live-route-runtime.js';
import type { LiveRouteTravelerState } from './live-route-traveler.js';

export interface LiveRouteActorTickSample {
  readonly actorId: string;
  readonly state: LiveRouteTravelerState;
  readonly currentWorldPoint: Vec2;
  /** Recovery/resync ticks suppress route-boundary validation while preserving handoff/chart sync. */
  readonly observeRouteBoundary?: boolean;
}

/** Physical attempt to cross a sibling branch that shared route authority has made illegal. */
export interface LiveRouteBranchViolation {
  readonly actorId: string;
  readonly stageId: string;
  readonly attemptedChoiceId: string;
  readonly lockedChoiceId: string;
  readonly crossingFraction: number;
}

export interface LiveRouteActorTickResult {
  readonly actorId: string;
  readonly observation: RouteBoundaryObservation | null;
  readonly sharedDecision: SharedRouteChoiceDecision | null;
  readonly branchViolation: LiveRouteBranchViolation | null;
  readonly routeUpdate: RouteDagUpdate | null;
  readonly handoffEvent: RouteStageHandoffEvent;
  readonly committed: boolean;
}

export interface LiveRouteMultiActorTickResult {
  readonly actors: readonly LiveRouteActorTickResult[];
  readonly arbitration: SharedRouteChoiceArbitration;
}

interface ObservedActor {
  readonly sample: LiveRouteActorTickSample;
  readonly routeMutationEligible: boolean;
  readonly allowedChoiceId: string | null;
  readonly physicalObservation: RouteBoundaryObservation | null;
  readonly observation: RouteBoundaryObservation | null;
}

/**
 * Advance all actor route transactions for one already-completed physics tick.
 *
 * This is deliberately a two-phase route operation:
 *
 * 1. observe every actor's physical route-boundary motion without mutating any RouteDag;
 * 2. arbitrate the race/session branch policy once;
 * 3. apply accepted actor RouteDag transitions and queue their PENDING handoffs;
 * 4. process each actor's physical handoff seam over the same world-motion segment;
 * 5. publish the new observation origin for the next tick.
 *
 * Vehicle physics, camera and renderer state are owned by the caller. The caller must finish all
 * actor physics updates before invoking this function.
 */
export function advanceLiveRouteMultiActorTick(
  live: LiveRouteRuntimeAssembly,
  shared: SharedRouteChoiceState,
  samples: readonly LiveRouteActorTickSample[],
): LiveRouteMultiActorTickResult {
  assertActorSamples(samples);

  const observed: ObservedActor[] = samples.map((sample) => {
    const routeMutationEligible = sample.state.handoffState.pending === null
      && sample.observeRouteBoundary !== false;
    if (!routeMutationEligible) {
      return Object.freeze({
        sample,
        routeMutationEligible,
        allowedChoiceId: null,
        physicalObservation: null,
        observation: null,
      });
    }

    const allowedChoiceId = sharedRouteAllowedTransitionChoiceId(
      live.route,
      shared,
      sample.state.routeState.activeStageId,
    );
    const physicalObservation = observeRouteBoundaryCrossing(
      live.route,
      sample.state.routeState,
      live.gates,
      sample.state.previousWorldPoint,
      sample.currentWorldPoint,
    );
    const observation = allowedChoiceId === null
      ? physicalObservation
      : observeRouteBoundaryCrossing(
        live.route,
        sample.state.routeState,
        live.gates,
        sample.state.previousWorldPoint,
        sample.currentWorldPoint,
        allowedChoiceId,
      );
    return Object.freeze({
      sample,
      routeMutationEligible,
      allowedChoiceId,
      physicalObservation,
      observation,
    });
  });

  const transitionCandidates: SharedRouteChoiceCandidate[] = [];
  for (const item of observed) {
    const boundary = item.observation?.boundary;
    if (boundary?.kind !== 'TRANSITION') continue;
    const crossingFraction = item.observation?.crossingFraction;
    if (crossingFraction === null || crossingFraction === undefined) {
      throw new Error(`validated transition is missing physical crossing fraction: ${item.sample.actorId}`);
    }
    transitionCandidates.push(Object.freeze({
      actorId: item.sample.actorId,
      activeStageId: item.sample.state.routeState.activeStageId,
      boundary,
      crossingFraction,
    }));
  }

  const arbitration = arbitrateSharedRouteChoiceCandidates(
    live.route,
    shared,
    transitionCandidates,
  );
  const decisionsByActor = new Map(
    arbitration.decisions.map((decision) => [decision.actorId, decision] as const),
  );

  const results: LiveRouteActorTickResult[] = [];
  for (const item of observed) {
    const { sample, observation, routeMutationEligible } = item;
    let routeUpdate: RouteDagUpdate | null = null;
    const sharedDecision = decisionsByActor.get(sample.actorId) ?? null;
    const branchViolation = routeMutationEligible
      ? detectBranchViolation(item, sharedDecision, shared)
      : null;

    if (routeMutationEligible) {
      const acceptedBoundary = acceptedBoundaryForActor(observation, sharedDecision);
      routeUpdate = updateRouteDag(sample.state.routeState, live.route, acceptedBoundary);
      queueRouteStageHandoff(sample.state.handoffState, live.handoffs, routeUpdate);
    }

    const handoffObservation = observePendingRouteStageHandoff(
      sample.state.handoffState,
      live.handoffs,
      sample.state.previousWorldPoint,
      sample.currentWorldPoint,
    );
    const handoffEvent = commitRouteStageHandoff(
      sample.state.handoffState,
      sample.state.routeState,
      live.content,
      live.charts,
      handoffObservation.seam,
      sample.currentWorldPoint,
    );
    if (handoffEvent !== 'COMMITTED') {
      syncRouteStageHandoffCoordinate(
        sample.state.handoffState,
        live.charts,
        sample.currentWorldPoint,
      );
    }
    sample.state.previousWorldPoint = { ...sample.currentWorldPoint };

    results.push(Object.freeze({
      actorId: sample.actorId,
      observation,
      sharedDecision,
      branchViolation,
      routeUpdate,
      handoffEvent,
      committed: handoffEvent === 'COMMITTED',
    }));
  }

  return Object.freeze({
    actors: Object.freeze(results),
    arbitration,
  });
}

function detectBranchViolation(
  item: ObservedActor,
  decision: SharedRouteChoiceDecision | null,
  shared: SharedRouteChoiceState,
): LiveRouteBranchViolation | null {
  if (decision?.reason === 'CONFLICTS_WITH_LOCK') {
    const lock = getSharedRouteChoiceLock(shared, decision.stageId);
    const crossingFraction = item.observation?.crossingFraction;
    if (lock === null || crossingFraction === null || crossingFraction === undefined) {
      throw new Error(`rejected shared branch crossing lacks lock geometry: ${item.sample.actorId}`);
    }
    return Object.freeze({
      actorId: item.sample.actorId,
      stageId: decision.stageId,
      attemptedChoiceId: decision.choiceId,
      lockedChoiceId: lock.choiceId,
      crossingFraction,
    });
  }

  if (item.allowedChoiceId === null) return null;
  const boundary = item.physicalObservation?.boundary;
  if (boundary?.kind !== 'TRANSITION' || boundary.choiceId === item.allowedChoiceId) return null;
  const crossingFraction = item.physicalObservation?.crossingFraction;
  if (crossingFraction === null || crossingFraction === undefined) {
    throw new Error(`forbidden shared branch crossing lacks physical fraction: ${item.sample.actorId}`);
  }
  return Object.freeze({
    actorId: item.sample.actorId,
    stageId: item.sample.state.routeState.activeStageId,
    attemptedChoiceId: boundary.choiceId,
    lockedChoiceId: item.allowedChoiceId,
    crossingFraction,
  });
}

function acceptedBoundaryForActor(
  observation: RouteBoundaryObservation | null,
  decision: SharedRouteChoiceDecision | null,
): ValidatedRouteBoundary | null {
  const boundary = observation?.boundary ?? null;
  if (boundary?.kind !== 'TRANSITION') return boundary;
  if (decision === null) {
    throw new Error('validated transition reached apply phase without shared arbitration decision');
  }
  return decision.accepted ? boundary : null;
}

function assertActorSamples(samples: readonly LiveRouteActorTickSample[]): void {
  const actorIds = new Set<string>();
  const states = new Set<LiveRouteTravelerState>();
  for (const sample of samples) {
    if (typeof sample.actorId !== 'string' || sample.actorId.trim().length === 0) {
      throw new RangeError('live route actor id must be a non-empty string');
    }
    if (actorIds.has(sample.actorId)) {
      throw new RangeError(`duplicate live route actor id in one tick: ${sample.actorId}`);
    }
    if (states.has(sample.state)) {
      throw new RangeError(`one live route traveler state cannot be submitted twice in one tick: ${sample.actorId}`);
    }
    actorIds.add(sample.actorId);
    states.add(sample.state);
    if (![sample.currentWorldPoint.x, sample.currentWorldPoint.z].every(Number.isFinite)) {
      throw new RangeError(`live route actor world point must be finite: ${sample.actorId}`);
    }
  }
}