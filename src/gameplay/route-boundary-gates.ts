import type { Vec2 } from '../core/math.js';
import { finitePoint, nonEmptyId } from '../core/validation.js';
import {
  getAvailableRouteChoices,
  getRouteChoice,
  getRouteStage,
  type RouteChoice,
  type RouteDag,
  type RouteDagState,
  type ValidatedRouteBoundary,
} from './route-dag.js';
import {
  compileWorldCrossingGate,
  observeWorldCrossingGate,
  type WorldCrossingGate,
  type WorldCrossingGateAuthoring,
} from './world-crossing-gate.js';

export type RouteBoundaryObservationEvent =
  'NONE' | 'VALIDATED_TRANSITION' | 'VALIDATED_FINISH' | 'REVERSE_CROSSING' | 'AMBIGUOUS_FORWARD_CROSSING';

export type RouteBoundaryGateAuthoringBase = WorldCrossingGateAuthoring;

export interface RouteTransitionGateAuthoring extends RouteBoundaryGateAuthoringBase {
  readonly kind: 'TRANSITION';
  readonly choiceId: string;
}

export interface RouteFinishGateAuthoring extends RouteBoundaryGateAuthoringBase {
  readonly kind: 'FINISH';
  readonly stageId: string;
}

export type RouteBoundaryGateAuthoring = RouteTransitionGateAuthoring | RouteFinishGateAuthoring;

export type RouteBoundaryGateBase = WorldCrossingGate;

export interface RouteTransitionGate extends RouteBoundaryGateBase {
  readonly kind: 'TRANSITION';
  readonly choiceId: string;
}

export interface RouteFinishGate extends RouteBoundaryGateBase {
  readonly kind: 'FINISH';
  readonly stageId: string;
}

export type RouteBoundaryGate = RouteTransitionGate | RouteFinishGate;

export interface RouteBoundaryGateSet {
  readonly gates: readonly RouteBoundaryGate[];
}

export interface RouteBoundaryObservation {
  readonly event: RouteBoundaryObservationEvent;
  readonly boundary: ValidatedRouteBoundary | null;
  readonly gate: RouteBoundaryGate | null;
  readonly forwardCrossingCount: number;
  readonly reverseCrossingCount: number;
  /** Position of the unique observed physical crossing within this world-motion step, in [0,1]. */
  readonly crossingFraction: number | null;
}

interface GateCrossing {
  readonly gate: RouteBoundaryGate;
  readonly direction: 'FORWARD' | 'REVERSE';
  readonly u: number;
}

/**
 * Compile route-selection and terminal-finish gates as explicit world-space geometry.
 *
 * Coverage is intentionally complete:
 * - every authored route choice has exactly one TRANSITION gate;
 * - every terminal route stage has exactly one FINISH gate;
 * - no gate may target a non-current/non-terminal concept through a broken reference.
 *
 * This layer contains no sprite pixels, screen X, raw chainage or vehicle handling values.
 */
export function compileRouteBoundaryGateSet(
  route: RouteDag,
  authoring: readonly RouteBoundaryGateAuthoring[],
): RouteBoundaryGateSet {
  const gateIds = new Set<string>();
  const transitionChoiceIds = new Set<string>();
  const finishStageIds = new Set<string>();
  const gates: RouteBoundaryGate[] = [];

  for (const source of authoring) {
    nonEmptyId(source.id, 'route boundary gate id');
    if (gateIds.has(source.id)) throw new RangeError(`duplicate route boundary gate id: ${source.id}`);
    gateIds.add(source.id);

    const geometry = compileWorldCrossingGate(source);

    if (source.kind === 'TRANSITION') {
      const choice = getRouteChoice(route, source.choiceId);
      if (transitionChoiceIds.has(choice.id)) {
        throw new RangeError(`route choice ${choice.id} has more than one transition gate`);
      }
      transitionChoiceIds.add(choice.id);
      gates.push(Object.freeze({ ...source, ...geometry }));
      continue;
    }

    if (source.kind === 'FINISH') {
      const stage = getRouteStage(route, source.stageId);
      if (stage.kind !== 'TERMINAL') {
        throw new RangeError(`finish gate ${source.id} must target a terminal route stage`);
      }
      if (finishStageIds.has(stage.id)) {
        throw new RangeError(`terminal route stage ${stage.id} has more than one finish gate`);
      }
      finishStageIds.add(stage.id);
      gates.push(Object.freeze({ ...source, ...geometry }));
      continue;
    }

    const exhaustive: never = source;
    throw new Error(`unsupported route boundary gate: ${String(exhaustive)}`);
  }

  for (const choice of route.choices) {
    if (!transitionChoiceIds.has(choice.id)) {
      throw new RangeError(`route choice ${choice.id} is missing a transition gate`);
    }
  }
  for (const stage of route.stages) {
    if (stage.kind === 'TERMINAL' && !finishStageIds.has(stage.id)) {
      throw new RangeError(`terminal route stage ${stage.id} is missing a finish gate`);
    }
  }

  return Object.freeze({ gates: Object.freeze(gates) });
}

/**
 * Observe one physical world-motion segment and emit at most one validated route boundary.
 *
 * Only gates legal for the current route state are candidates:
 * - non-terminal stage: outgoing route-choice gates;
 * - terminal stage: that stage's finish gate.
 *
 * An optional allowedTransitionChoiceId narrows a branching stage to one already-authorized
 * physical choice without changing authored gate geometry. Reverse crossings never validate.
 * If one physics step forward-crosses more than one legal gate, the observation is rejected as
 * ambiguous rather than choosing by screen position, gate ordering or arbitrary ID.
 */
export function observeRouteBoundaryCrossing(
  route: RouteDag,
  state: Pick<RouteDagState, 'activeStageId' | 'status'>,
  gateSet: RouteBoundaryGateSet,
  previous: Vec2,
  current: Vec2,
  allowedTransitionChoiceId: string | null = null,
): RouteBoundaryObservation {
  finitePoint(previous, 'previous route-boundary point');
  finitePoint(current, 'current route-boundary point');

  if (state.status === 'FINISHED') return emptyObservation();

  const activeStage = getRouteStage(route, state.activeStageId);
  let availableChoices = activeStage.kind === 'TERMINAL' ? [] : getAvailableRouteChoices(route, state as RouteDagState);
  if (allowedTransitionChoiceId !== null) {
    if (activeStage.kind === 'TERMINAL') {
      throw new RangeError('terminal route stage cannot have an allowed transition choice');
    }
    const allowedChoice = getRouteChoice(route, allowedTransitionChoiceId);
    if (allowedChoice.fromStageId !== activeStage.id || !activeStage.outgoingChoiceIds.includes(allowedChoice.id)) {
      throw new RangeError(
        `allowed transition choice ${allowedTransitionChoiceId} does not leave active stage ${activeStage.id}`,
      );
    }
    availableChoices = availableChoices.filter((choice) => choice.id === allowedTransitionChoiceId);
  }

  const candidates =
    activeStage.kind === 'TERMINAL'
      ? gateSet.gates.filter(
          (gate): gate is RouteFinishGate => gate.kind === 'FINISH' && gate.stageId === activeStage.id,
        )
      : availableChoices.map((choice) => getTransitionGateForChoice(gateSet, choice));

  const crossings = candidates
    .map((gate) => detectGateCrossing(gate, previous, current))
    .filter((crossing): crossing is GateCrossing => crossing !== null)
    .sort((a, b) => a.u - b.u);

  const forward = crossings.filter((crossing) => crossing.direction === 'FORWARD');
  const reverse = crossings.filter((crossing) => crossing.direction === 'REVERSE');

  if (forward.length > 1) {
    return {
      event: 'AMBIGUOUS_FORWARD_CROSSING',
      boundary: null,
      gate: null,
      forwardCrossingCount: forward.length,
      reverseCrossingCount: reverse.length,
      crossingFraction: null,
    };
  }

  if (forward.length === 1) {
    const crossing = forward[0]!;
    if (crossing.gate.kind === 'TRANSITION') {
      return {
        event: 'VALIDATED_TRANSITION',
        boundary: { kind: 'TRANSITION', choiceId: crossing.gate.choiceId },
        gate: crossing.gate,
        forwardCrossingCount: 1,
        reverseCrossingCount: reverse.length,
        crossingFraction: crossing.u,
      };
    }
    return {
      event: 'VALIDATED_FINISH',
      boundary: { kind: 'FINISH', stageId: crossing.gate.stageId },
      gate: crossing.gate,
      forwardCrossingCount: 1,
      reverseCrossingCount: reverse.length,
      crossingFraction: crossing.u,
    };
  }

  if (reverse.length > 0) {
    return {
      event: 'REVERSE_CROSSING',
      boundary: null,
      gate: reverse[0]!.gate,
      forwardCrossingCount: 0,
      reverseCrossingCount: reverse.length,
      crossingFraction: reverse[0]!.u,
    };
  }

  return emptyObservation();
}

function getTransitionGateForChoice(gateSet: RouteBoundaryGateSet, choice: RouteChoice): RouteTransitionGate {
  const gate = gateSet.gates.find(
    (candidate): candidate is RouteTransitionGate =>
      candidate.kind === 'TRANSITION' && candidate.choiceId === choice.id,
  );
  if (!gate) throw new Error(`compiled transition gate missing for route choice: ${choice.id}`);
  return gate;
}

function detectGateCrossing(gate: RouteBoundaryGate, previous: Vec2, current: Vec2): GateCrossing | null {
  const crossing = observeWorldCrossingGate(gate, previous, current);
  return crossing === null ? null : { gate, direction: crossing.direction, u: crossing.u };
}

function emptyObservation(): RouteBoundaryObservation {
  return {
    event: 'NONE',
    boundary: null,
    gate: null,
    forwardCrossingCount: 0,
    reverseCrossingCount: 0,
    crossingFraction: null,
  };
}
