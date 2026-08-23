export type RouteStageKind = 'STAGE' | 'TERMINAL';
export type RouteDagStatus = 'RUNNING' | 'FINISHED';
export type RouteDagEvent =
  | 'NONE'
  | 'TRANSITION_ACCEPTED'
  | 'FINISHED'
  | 'REJECTED_INVALID_TRANSITION'
  | 'REJECTED_INVALID_FINISH'
  | 'IGNORED_AFTER_FINISH';

export interface RouteStageAuthoring {
  readonly id: string;
  readonly kind: RouteStageKind;
}

export interface RouteChoiceAuthoring {
  readonly id: string;
  readonly fromStageId: string;
  readonly toStageId: string;
}

export interface RouteStage extends RouteStageAuthoring {
  readonly outgoingChoiceIds: readonly string[];
}

export interface RouteChoice extends RouteChoiceAuthoring {}

/**
 * Gameplay-only route DAG. It deliberately contains no road geometry, screen coordinates,
 * steering thresholds or raw chainage. Physical route-selection gates are a separate layer.
 */
export interface RouteDag {
  readonly startStageId: string;
  readonly stages: readonly RouteStage[];
  readonly choices: readonly RouteChoice[];
}

/**
 * Future world-space branch validation emits one of these events after a physical boundary
 * has actually been accepted. This route layer never decides a branch from input or screen X.
 */
export type ValidatedRouteBoundary =
  | {
      readonly kind: 'TRANSITION';
      readonly choiceId: string;
    }
  | {
      readonly kind: 'FINISH';
      readonly stageId: string;
    };

export interface RouteDagState {
  activeStageId: string;
  status: RouteDagStatus;
  readonly visitedStageIds: string[];
  readonly selectedChoiceIds: string[];
  acceptedTransitionCount: number;
  rejectedBoundaryCount: number;
  finishStageId: string | null;
  lastEvent: RouteDagEvent;
}

export interface RouteDagUpdate {
  readonly event: RouteDagEvent;
  readonly status: RouteDagStatus;
  readonly activeStageId: string;
  readonly acceptedChoice: RouteChoice | null;
  readonly justFinished: boolean;
}

export function compileRouteDag(
  startStageId: string,
  stageAuthoring: readonly RouteStageAuthoring[],
  choiceAuthoring: readonly RouteChoiceAuthoring[],
): RouteDag {
  assertNonEmptyId(startStageId, 'start stage id');
  if (stageAuthoring.length === 0) throw new RangeError('route DAG requires at least one stage');

  const stagesById = new Map<string, RouteStageAuthoring>();
  for (const stage of stageAuthoring) {
    assertNonEmptyId(stage.id, 'route stage id');
    if (stage.kind !== 'STAGE' && stage.kind !== 'TERMINAL') {
      const exhaustive: never = stage.kind;
      throw new RangeError(`unsupported route stage kind: ${exhaustive}`);
    }
    if (stagesById.has(stage.id)) throw new RangeError(`duplicate route stage id: ${stage.id}`);
    stagesById.set(stage.id, stage);
  }
  if (!stagesById.has(startStageId)) throw new RangeError('route start stage must exist');

  const choicesById = new Map<string, RouteChoiceAuthoring>();
  const outgoing = new Map<string, string[]>();
  for (const stage of stageAuthoring) outgoing.set(stage.id, []);

  for (const choice of choiceAuthoring) {
    assertNonEmptyId(choice.id, 'route choice id');
    assertNonEmptyId(choice.fromStageId, 'route choice fromStageId');
    assertNonEmptyId(choice.toStageId, 'route choice toStageId');
    if (choicesById.has(choice.id)) throw new RangeError(`duplicate route choice id: ${choice.id}`);
    if (!stagesById.has(choice.fromStageId) || !stagesById.has(choice.toStageId)) {
      throw new RangeError(`route choice ${choice.id} references a missing stage`);
    }
    if (choice.fromStageId === choice.toStageId) {
      throw new RangeError(`route choice ${choice.id} cannot self-loop`);
    }
    choicesById.set(choice.id, choice);
    outgoing.get(choice.fromStageId)!.push(choice.id);
  }

  for (const stage of stageAuthoring) {
    const stageOutgoing = outgoing.get(stage.id)!;
    if (stage.kind === 'TERMINAL' && stageOutgoing.length !== 0) {
      throw new RangeError(`terminal route stage ${stage.id} cannot have outgoing choices`);
    }
    if (stage.kind === 'STAGE' && stageOutgoing.length === 0) {
      throw new RangeError(`non-terminal route stage ${stage.id} requires an outgoing choice`);
    }
  }

  assertAcyclicAndReachable(startStageId, stageAuthoring, choiceAuthoring, outgoing, choicesById);

  const stages: RouteStage[] = stageAuthoring.map((stage) => ({
    ...stage,
    outgoingChoiceIds: Object.freeze([...outgoing.get(stage.id)!]),
  }));
  const choices: RouteChoice[] = choiceAuthoring.map((choice) => ({ ...choice }));

  return Object.freeze({
    startStageId,
    stages: Object.freeze(stages),
    choices: Object.freeze(choices),
  });
}

/**
 * Small OutRun-style DEV graph: one opening stage, a two-way split, then each side splits
 * again into four terminal stages. The graph is gameplay validation content only; it does not
 * imply that the current single closed renderer course already contains physical branches.
 */
export function createM6DebugRouteDag(): RouteDag {
  return compileRouteDag(
    'STAGE_1',
    [
      { id: 'STAGE_1', kind: 'STAGE' },
      { id: 'STAGE_2_L', kind: 'STAGE' },
      { id: 'STAGE_2_R', kind: 'STAGE' },
      { id: 'GOAL_LL', kind: 'TERMINAL' },
      { id: 'GOAL_LR', kind: 'TERMINAL' },
      { id: 'GOAL_RL', kind: 'TERMINAL' },
      { id: 'GOAL_RR', kind: 'TERMINAL' },
    ],
    [
      { id: 'S1_LEFT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_L' },
      { id: 'S1_RIGHT', fromStageId: 'STAGE_1', toStageId: 'STAGE_2_R' },
      { id: 'S2L_LEFT', fromStageId: 'STAGE_2_L', toStageId: 'GOAL_LL' },
      { id: 'S2L_RIGHT', fromStageId: 'STAGE_2_L', toStageId: 'GOAL_LR' },
      { id: 'S2R_LEFT', fromStageId: 'STAGE_2_R', toStageId: 'GOAL_RL' },
      { id: 'S2R_RIGHT', fromStageId: 'STAGE_2_R', toStageId: 'GOAL_RR' },
    ],
  );
}

export function createRouteDagState(route: RouteDag): RouteDagState {
  getRouteStage(route, route.startStageId);
  return {
    activeStageId: route.startStageId,
    status: 'RUNNING',
    visitedStageIds: [route.startStageId],
    selectedChoiceIds: [],
    acceptedTransitionCount: 0,
    rejectedBoundaryCount: 0,
    finishStageId: null,
    lastEvent: 'NONE',
  };
}

export function getRouteStage(route: RouteDag, stageId: string): RouteStage {
  const stage = route.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new RangeError(`unknown route stage: ${stageId}`);
  return stage;
}

export function getRouteChoice(route: RouteDag, choiceId: string): RouteChoice {
  const choice = route.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new RangeError(`unknown route choice: ${choiceId}`);
  return choice;
}

export function getAvailableRouteChoices(route: RouteDag, state: RouteDagState): readonly RouteChoice[] {
  const stage = getRouteStage(route, state.activeStageId);
  return stage.outgoingChoiceIds.map((choiceId) => getRouteChoice(route, choiceId));
}

/**
 * Consume only an already validated route-boundary event.
 *
 * A TRANSITION is accepted iff its authored edge leaves the current active stage. Entering a
 * terminal stage does not itself finish the run; an explicit validated FINISH boundary for
 * that terminal stage is still required. This keeps route choice and finish authority tied to
 * future physical world-space gate validation rather than route graph topology alone.
 */
export function updateRouteDag(
  state: RouteDagState,
  route: RouteDag,
  boundary: ValidatedRouteBoundary | null,
): RouteDagUpdate {
  state.lastEvent = 'NONE';

  if (boundary === null) return result(state, null, false);
  if (state.status === 'FINISHED') {
    state.lastEvent = 'IGNORED_AFTER_FINISH';
    return result(state, null, false);
  }

  if (boundary.kind === 'TRANSITION') {
    let choice: RouteChoice;
    try {
      choice = getRouteChoice(route, boundary.choiceId);
    } catch {
      state.rejectedBoundaryCount += 1;
      state.lastEvent = 'REJECTED_INVALID_TRANSITION';
      return result(state, null, false);
    }

    if (choice.fromStageId !== state.activeStageId) {
      state.rejectedBoundaryCount += 1;
      state.lastEvent = 'REJECTED_INVALID_TRANSITION';
      return result(state, null, false);
    }

    const currentStage = getRouteStage(route, state.activeStageId);
    if (!currentStage.outgoingChoiceIds.includes(choice.id)) {
      state.rejectedBoundaryCount += 1;
      state.lastEvent = 'REJECTED_INVALID_TRANSITION';
      return result(state, null, false);
    }

    state.activeStageId = choice.toStageId;
    state.selectedChoiceIds.push(choice.id);
    state.visitedStageIds.push(choice.toStageId);
    state.acceptedTransitionCount += 1;
    state.lastEvent = 'TRANSITION_ACCEPTED';
    return result(state, choice, false);
  }

  if (boundary.kind === 'FINISH') {
    const activeStage = getRouteStage(route, state.activeStageId);
    if (boundary.stageId !== state.activeStageId || activeStage.kind !== 'TERMINAL') {
      state.rejectedBoundaryCount += 1;
      state.lastEvent = 'REJECTED_INVALID_FINISH';
      return result(state, null, false);
    }

    state.status = 'FINISHED';
    state.finishStageId = activeStage.id;
    state.lastEvent = 'FINISHED';
    return result(state, null, true);
  }

  const exhaustive: never = boundary;
  throw new Error(`unsupported route boundary: ${String(exhaustive)}`);
}

function result(
  state: RouteDagState,
  acceptedChoice: RouteChoice | null,
  justFinished: boolean,
): RouteDagUpdate {
  return {
    event: state.lastEvent,
    status: state.status,
    activeStageId: state.activeStageId,
    acceptedChoice,
    justFinished,
  };
}

function assertNonEmptyId(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}

function assertAcyclicAndReachable(
  startStageId: string,
  stages: readonly RouteStageAuthoring[],
  choices: readonly RouteChoiceAuthoring[],
  outgoing: ReadonlyMap<string, readonly string[]>,
  choicesById: ReadonlyMap<string, RouteChoiceAuthoring>,
): void {
  const color = new Map<string, 0 | 1 | 2>();
  for (const stage of stages) color.set(stage.id, 0);
  const reachable = new Set<string>();

  const visit = (stageId: string): void => {
    const currentColor = color.get(stageId);
    if (currentColor === 1) throw new RangeError('route graph must be acyclic');
    if (currentColor === 2) {
      reachable.add(stageId);
      return;
    }

    color.set(stageId, 1);
    reachable.add(stageId);
    for (const choiceId of outgoing.get(stageId) ?? []) {
      const choice = choicesById.get(choiceId);
      if (!choice) throw new Error(`compiled route choice missing: ${choiceId}`);
      visit(choice.toStageId);
    }
    color.set(stageId, 2);
  };

  visit(startStageId);

  if (reachable.size !== stages.length) {
    const unreachable = stages.filter((stage) => !reachable.has(stage.id)).map((stage) => stage.id);
    throw new RangeError(`route graph contains unreachable stages: ${unreachable.join(', ')}`);
  }

  // All choices were already endpoint-validated; this assertion protects future refactors that
  // might accidentally leave authored choices disconnected from the reachable stage traversal.
  const reachableChoiceIds = new Set<string>();
  for (const stageId of reachable) {
    for (const choiceId of outgoing.get(stageId) ?? []) reachableChoiceIds.add(choiceId);
  }
  if (reachableChoiceIds.size !== choices.length) {
    throw new RangeError('route graph contains unreachable choices');
  }
}
