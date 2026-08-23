import {
  dot,
  normalFromHeading,
  subtract,
  tangentFromHeading,
  type Vec2,
} from '../core/math.js';
import {
  getAvailableRouteChoices,
  getRouteChoice,
  getRouteStage,
  type RouteChoice,
  type RouteDag,
  type RouteDagState,
  type ValidatedRouteBoundary,
} from './route-dag.js';

const CROSSING_EPSILON = 1e-9;

export type RouteBoundaryGateKind = 'TRANSITION' | 'FINISH';
export type RouteBoundaryObservationEvent =
  | 'NONE'
  | 'VALIDATED_TRANSITION'
  | 'VALIDATED_FINISH'
  | 'REVERSE_CROSSING'
  | 'AMBIGUOUS_FORWARD_CROSSING';

export interface RouteBoundaryGateAuthoringBase {
  readonly id: string;
  readonly center: Vec2;
  /** World heading in the same +Z-forward / positive-yaw-to-+X convention as Core. */
  readonly heading: number;
  readonly halfWidth: number;
}

export interface RouteTransitionGateAuthoring extends RouteBoundaryGateAuthoringBase {
  readonly kind: 'TRANSITION';
  readonly choiceId: string;
}

export interface RouteFinishGateAuthoring extends RouteBoundaryGateAuthoringBase {
  readonly kind: 'FINISH';
  readonly stageId: string;
}

export type RouteBoundaryGateAuthoring = RouteTransitionGateAuthoring | RouteFinishGateAuthoring;

export interface RouteBoundaryGateBase extends RouteBoundaryGateAuthoringBase {
  readonly tangent: Vec2;
  readonly normal: Vec2;
}

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
    assertNonEmpty(source.id, 'route boundary gate id');
    if (gateIds.has(source.id)) throw new RangeError(`duplicate route boundary gate id: ${source.id}`);
    gateIds.add(source.id);

    if (![source.center.x, source.center.z, source.heading, source.halfWidth].every(Number.isFinite)) {
      throw new RangeError(`route boundary gate ${source.id} geometry must be finite`);
    }
    if (!(source.halfWidth > 0)) {
      throw new RangeError(`route boundary gate ${source.id} halfWidth must be > 0`);
    }

    const tangent = tangentFromHeading(source.heading);
    const normal = normalFromHeading(source.heading);

    if (source.kind === 'TRANSITION') {
      const choice = getRouteChoice(route, source.choiceId);
      if (transitionChoiceIds.has(choice.id)) {
        throw new RangeError(`route choice ${choice.id} has more than one transition gate`);
      }
      transitionChoiceIds.add(choice.id);
      gates.push(Object.freeze({ ...source, tangent, normal }));
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
      gates.push(Object.freeze({ ...source, tangent, normal }));
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
  assertFinitePoint(previous, 'previous route-boundary point');
  assertFinitePoint(current, 'current route-boundary point');

  if (state.status === 'FINISHED') return emptyObservation();

  const activeStage = getRouteStage(route, state.activeStageId);
  let availableChoices = activeStage.kind === 'TERMINAL'
    ? []
    : getAvailableRouteChoices(route, state as RouteDagState);
  if (allowedTransitionChoiceId !== null) {
    if (activeStage.kind === 'TERMINAL') {
      throw new RangeError('terminal route stage cannot have an allowed transition choice');
    }
    const allowedChoice = getRouteChoice(route, allowedTransitionChoiceId);
    if (allowedChoice.fromStageId !== activeStage.id
      || !activeStage.outgoingChoiceIds.includes(allowedChoice.id)) {
      throw new RangeError(
        `allowed transition choice ${allowedTransitionChoiceId} does not leave active stage ${activeStage.id}`,
      );
    }
    availableChoices = availableChoices.filter((choice) => choice.id === allowedTransitionChoiceId);
  }

  const candidates = activeStage.kind === 'TERMINAL'
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

/**
 * Pure DEV geometry for the M6.8 route graph. Coordinates are intentionally separate from
 * the current closed renderer course; this is a world-space validator test fixture only.
 */
export function createM6DebugRouteBoundaryGateSet(route: RouteDag): RouteBoundaryGateSet {
  return compileRouteBoundaryGateSet(route, [
    { id: 'G_S1_LEFT', kind: 'TRANSITION', choiceId: 'S1_LEFT', center: { x: -3, z: 10 }, heading: 0, halfWidth: 2 },
    { id: 'G_S1_RIGHT', kind: 'TRANSITION', choiceId: 'S1_RIGHT', center: { x: 3, z: 10 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2L_LEFT', kind: 'TRANSITION', choiceId: 'S2L_LEFT', center: { x: -7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2L_RIGHT', kind: 'TRANSITION', choiceId: 'S2L_RIGHT', center: { x: -2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2R_LEFT', kind: 'TRANSITION', choiceId: 'S2R_LEFT', center: { x: 2, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_S2R_RIGHT', kind: 'TRANSITION', choiceId: 'S2R_RIGHT', center: { x: 7, z: 20 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_LL', kind: 'FINISH', stageId: 'GOAL_LL', center: { x: -8, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_LR', kind: 'FINISH', stageId: 'GOAL_LR', center: { x: -3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_RL', kind: 'FINISH', stageId: 'GOAL_RL', center: { x: 3, z: 30 }, heading: 0, halfWidth: 2 },
    { id: 'G_GOAL_RR', kind: 'FINISH', stageId: 'GOAL_RR', center: { x: 8, z: 30 }, heading: 0, halfWidth: 2 },
  ]);
}

function getTransitionGateForChoice(
  gateSet: RouteBoundaryGateSet,
  choice: RouteChoice,
): RouteTransitionGate {
  const gate = gateSet.gates.find(
    (candidate): candidate is RouteTransitionGate =>
      candidate.kind === 'TRANSITION' && candidate.choiceId === choice.id,
  );
  if (!gate) throw new Error(`compiled transition gate missing for route choice: ${choice.id}`);
  return gate;
}

function detectGateCrossing(
  gate: RouteBoundaryGate,
  previous: Vec2,
  current: Vec2,
): GateCrossing | null {
  const previousRelative = subtract(previous, gate.center);
  const currentRelative = subtract(current, gate.center);
  const a0 = dot(previousRelative, gate.tangent);
  const a1 = dot(currentRelative, gate.tangent);

  let direction: 'FORWARD' | 'REVERSE' | null = null;
  if (a0 < -CROSSING_EPSILON && a1 >= -CROSSING_EPSILON) direction = 'FORWARD';
  else if (a0 > CROSSING_EPSILON && a1 <= CROSSING_EPSILON) direction = 'REVERSE';
  if (direction === null) return null;

  const denominator = a1 - a0;
  if (Math.abs(denominator) <= CROSSING_EPSILON) return null;
  const u = -a0 / denominator;
  if (u < 0 || u > 1) return null;

  const crossingPoint = {
    x: previous.x + (current.x - previous.x) * u,
    z: previous.z + (current.z - previous.z) * u,
  };
  const lateral = dot(subtract(crossingPoint, gate.center), gate.normal);
  if (Math.abs(lateral) > gate.halfWidth + CROSSING_EPSILON) return null;

  return { gate, direction, u };
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

function assertFinitePoint(point: Vec2, label: string): void {
  if (![point.x, point.z].every(Number.isFinite)) throw new RangeError(`${label} must be finite`);
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}
