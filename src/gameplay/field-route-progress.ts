import {
  locateWorldOnGuideCoordinateGlobal,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { clamp } from '../core/math.js';
import type { RouteBoundaryGateSet } from './route-boundary-gates.js';
import {
  getRouteChoice,
  getRouteStage,
  type RouteDag,
  type RouteDagState,
  type RouteDagStatus,
  type RouteDagUpdate,
} from './route-dag.js';
import type {
  RouteStageHandoffManifest,
  RouteStageHandoffState,
} from './route-stage-handoff.js';

const PROGRESS_EPSILON = 1e-6;

export interface FieldRouteProgressStageSource {
  readonly stageId: string;
  readonly coordinateFrame: GuideCoordinateSource;
}

export interface FieldRouteProgressChoiceRule {
  readonly choiceId: string;
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly gateProgress: number;
  readonly handoffProgress: number;
}

export interface FieldRouteProgressStageRule {
  readonly stageId: string;
  /** Translation from the stage chart's open local s into the selected route ruler. */
  readonly progressOffset: number;
  /** Common physical decision boundary for siblings, or the terminal FINISH boundary. */
  readonly boundaryProgress: number;
  readonly boundaryKind: 'TRANSITION' | 'FINISH';
}

export interface FieldRouteProgressRules {
  readonly startProgress: number;
  readonly stages: readonly FieldRouteProgressStageRule[];
  readonly choices: readonly FieldRouteProgressChoiceRule[];
}

export interface FieldRouteProgressTravelerView {
  /** RouteDag authority. This may already be the target stage while handoff is PENDING. */
  readonly routeStageId: string;
  readonly routeStatus: RouteDagStatus;
  /** Committed chart/content authority. */
  readonly committedStageId: string;
  readonly committedS: number;
}

export type FieldRouteProgressValidatedBoundary =
  | { readonly kind: 'TRANSITION'; readonly choiceId: string }
  | { readonly kind: 'FINISH'; readonly stageId: string };

export type FieldRouteProgressEvent = 'NONE' | 'TRANSITION' | 'FINISH' | 'RESYNC';

export interface FieldRouteProgressState {
  /** Last physically validated route gate or FINISH. Recovery never decreases this value. */
  validatedProgressFloor: number;
  /** Continuous same-selected-route ranking progress, bounded by physical route boundaries. */
  sProgress: number;
  acceptedTransitionCount: number;
  status: RouteDagStatus;
  lastEvent: FieldRouteProgressEvent;
  previousGeometricProgress: number;
}

export interface FieldRouteProgressWindow {
  readonly floor: number;
  readonly ceiling: number;
}

export function fieldRouteProgressTravelerView(
  route: Pick<RouteDagState, 'activeStageId' | 'status'>,
  handoff: Pick<RouteStageHandoffState, 'activeStageId' | 'coordinate'>,
): FieldRouteProgressTravelerView {
  return Object.freeze({
    routeStageId: route.activeStageId,
    routeStatus: route.status,
    committedStageId: handoff.activeStageId,
    committedS: handoff.coordinate.s,
  });
}

export function fieldRouteProgressBoundaryFromRouteUpdate(
  update: RouteDagUpdate | null,
): FieldRouteProgressValidatedBoundary | null {
  if (update?.acceptedChoice) {
    return Object.freeze({ kind: 'TRANSITION', choiceId: update.acceptedChoice.id });
  }
  if (update?.event === 'FINISHED' && update.justFinished) {
    return Object.freeze({ kind: 'FINISH', stageId: update.activeStageId });
  }
  return null;
}

/**
 * Compile ordinary open stage charts into one route-progress ruler.
 *
 * The handoff seam is the only translation authority between adjacent charts. Sibling route
 * gates must resolve to the same progress because FIRST_PHYSICAL_CROSSING_LOCKS keeps the field
 * on one selected route; branch identity is deliberately not encoded in the ranking scalar.
 */
export function compileFieldRouteProgressRules(
  route: RouteDag,
  gates: RouteBoundaryGateSet,
  handoffs: RouteStageHandoffManifest,
  stageSources: readonly FieldRouteProgressStageSource[],
): FieldRouteProgressRules {
  const sourceByStage = new Map<string, GuideCoordinateSource>();
  for (const source of stageSources) {
    if (sourceByStage.has(source.stageId)) {
      throw new RangeError(`duplicate field route progress stage source: ${source.stageId}`);
    }
    getRouteStage(route, source.stageId);
    sourceByStage.set(source.stageId, source.coordinateFrame);
  }
  for (const stage of route.stages) {
    if (!sourceByStage.has(stage.id)) {
      throw new RangeError(`field route progress is missing stage source: ${stage.id}`);
    }
  }

  const offsets = new Map<string, number>([[route.startStageId, 0]]);
  const choiceRules = new Map<string, FieldRouteProgressChoiceRule>();
  const pendingStages = [route.startStageId];

  while (pendingStages.length > 0) {
    const stageId = pendingStages.shift()!;
    const stage = getRouteStage(route, stageId);
    const sourceFrame = sourceByStage.get(stageId)!;
    const sourceOffset = offsets.get(stageId)!;

    for (const choiceId of stage.outgoingChoiceIds) {
      const choice = getRouteChoice(route, choiceId);
      const gate = gates.gates.find(
        (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === choice.id,
      );
      const seam = handoffs.seams.find((candidate) => candidate.choiceId === choice.id);
      if (!gate || !seam) throw new Error(`compiled field route boundary missing for choice: ${choice.id}`);

      const gateS = locateWorldOnGuideCoordinateGlobal(sourceFrame, gate.center, false).s;
      const gateProgress = sourceOffset + gateS;
      const handoffProgress = sourceOffset + seam.sourceSeamS;
      if (!(handoffProgress > gateProgress + PROGRESS_EPSILON)) {
        throw new RangeError(`field route handoff must follow its physical route gate: ${choice.id}`);
      }

      const targetOffset = handoffProgress - seam.targetSeamS;
      const existingOffset = offsets.get(choice.toStageId);
      if (existingOffset === undefined) {
        offsets.set(choice.toStageId, targetOffset);
        pendingStages.push(choice.toStageId);
      } else if (Math.abs(existingOffset - targetOffset) > PROGRESS_EPSILON) {
        throw new RangeError(`field route merge has inconsistent progress authority: ${choice.toStageId}`);
      }

      choiceRules.set(choice.id, Object.freeze({
        choiceId: choice.id,
        fromStageId: choice.fromStageId,
        toStageId: choice.toStageId,
        gateProgress,
        handoffProgress,
      }));
    }
  }

  const stageRules = route.stages.map((stage): FieldRouteProgressStageRule => {
    const frame = sourceByStage.get(stage.id)!;
    const offset = offsets.get(stage.id);
    if (offset === undefined) throw new Error(`unreachable field route progress stage: ${stage.id}`);

    if (stage.kind === 'TERMINAL') {
      const finish = gates.gates.find(
        (candidate) => candidate.kind === 'FINISH' && candidate.stageId === stage.id,
      );
      if (!finish) throw new Error(`compiled field route FINISH missing for stage: ${stage.id}`);
      const boundaryProgress = offset
        + locateWorldOnGuideCoordinateGlobal(frame, finish.center, false).s;
      return Object.freeze({
        stageId: stage.id,
        progressOffset: offset,
        boundaryProgress,
        boundaryKind: 'FINISH',
      });
    }

    const outgoing = stage.outgoingChoiceIds.map((choiceId) => choiceRules.get(choiceId)!);
    const boundaryProgress = outgoing[0]?.gateProgress;
    if (boundaryProgress === undefined) {
      throw new Error(`field route stage has no outgoing progress boundary: ${stage.id}`);
    }
    for (const rule of outgoing.slice(1)) {
      if (Math.abs(rule.gateProgress - boundaryProgress) > PROGRESS_EPSILON) {
        throw new RangeError(`sibling route gates must share one field progress boundary: ${stage.id}`);
      }
    }
    return Object.freeze({
      stageId: stage.id,
      progressOffset: offset,
      boundaryProgress,
      boundaryKind: 'TRANSITION',
    });
  });

  for (const choice of choiceRules.values()) {
    const targetBoundary = stageRules.find((stage) => stage.stageId === choice.toStageId)!.boundaryProgress;
    if (!(targetBoundary > choice.handoffProgress + PROGRESS_EPSILON)) {
      throw new RangeError(`field route target boundary must follow handoff seam: ${choice.choiceId}`);
    }
  }

  return Object.freeze({
    startProgress: 0,
    stages: Object.freeze(stageRules),
    choices: Object.freeze(route.choices.map((choice) => choiceRules.get(choice.id)!)),
  });
}

export function createFieldRouteProgressState(
  rules: FieldRouteProgressRules,
  traveler: FieldRouteProgressTravelerView,
): FieldRouteProgressState {
  assertTravelerView(traveler);
  const geometric = fieldRouteGeometricProgress(
    rules,
    traveler.committedStageId,
    traveler.committedS,
  );
  const firstWindow = fieldRouteProgressWindow(rules, traveler.routeStageId, rules.startProgress);
  return {
    validatedProgressFloor: rules.startProgress,
    sProgress: clamp(geometric, firstWindow.floor, firstWindow.ceiling),
    acceptedTransitionCount: 0,
    status: traveler.routeStatus,
    lastEvent: 'NONE',
    previousGeometricProgress: geometric,
  };
}

/**
 * Advance continuous ranking progress after one already-completed physical route tick.
 * Raw chart motion can interpolate only inside the window opened by validated physical gates.
 */
export function updateFieldRouteProgress(
  state: FieldRouteProgressState,
  rules: FieldRouteProgressRules,
  traveler: FieldRouteProgressTravelerView,
  boundary: FieldRouteProgressValidatedBoundary | null,
): FieldRouteProgressWindow {
  assertTravelerView(traveler);
  const geometric = fieldRouteGeometricProgress(
    rules,
    traveler.committedStageId,
    traveler.committedS,
  );
  const delta = geometric - state.previousGeometricProgress;
  state.lastEvent = 'NONE';

  if (boundary?.kind === 'TRANSITION') {
    const choice = getChoiceRule(rules, boundary.choiceId);
    if (choice.toStageId !== traveler.routeStageId) {
      throw new Error(`field progress transition disagrees with RouteDag stage: ${boundary.choiceId}`);
    }
    state.validatedProgressFloor = Math.max(state.validatedProgressFloor, choice.gateProgress);
    state.acceptedTransitionCount += 1;
    state.lastEvent = 'TRANSITION';
  } else if (boundary?.kind === 'FINISH') {
    const finishStage = getStageRule(rules, boundary.stageId);
    if (
      finishStage.boundaryKind !== 'FINISH'
      || traveler.routeStageId !== boundary.stageId
      || traveler.routeStatus !== 'FINISHED'
    ) {
      throw new Error(`field progress FINISH disagrees with RouteDag stage: ${boundary.stageId}`);
    }
    state.validatedProgressFloor = finishStage.boundaryProgress;
    state.sProgress = finishStage.boundaryProgress;
    state.status = 'FINISHED';
    state.lastEvent = 'FINISH';
    state.previousGeometricProgress = geometric;
    return fieldRouteProgressWindow(rules, traveler.routeStageId, state.validatedProgressFloor);
  }

  if (traveler.routeStatus === 'FINISHED') {
    if (state.status !== 'FINISHED') {
      throw new Error('finished RouteDag requires a validated field progress FINISH boundary');
    }
    state.previousGeometricProgress = geometric;
    return fieldRouteProgressWindow(rules, traveler.routeStageId, state.validatedProgressFloor);
  }
  const window = fieldRouteProgressWindow(rules, traveler.routeStageId, state.validatedProgressFloor);
  state.sProgress = clamp(state.sProgress + delta, window.floor, window.ceiling);
  state.status = traveler.routeStatus;
  state.previousGeometricProgress = geometric;
  return window;
}

/** Recovery/teleport resets geometric observation only; it cannot award or erase progress. */
export function resyncFieldRouteProgress(
  state: FieldRouteProgressState,
  rules: FieldRouteProgressRules,
  traveler: FieldRouteProgressTravelerView,
): void {
  assertTravelerView(traveler);
  state.previousGeometricProgress = fieldRouteGeometricProgress(
    rules,
    traveler.committedStageId,
    traveler.committedS,
  );
  state.status = traveler.routeStatus;
  state.lastEvent = 'RESYNC';
}

export function fieldRouteProgressWindow(
  rules: FieldRouteProgressRules,
  routeStageId: string,
  validatedProgressFloor: number,
): FieldRouteProgressWindow {
  if (!Number.isFinite(validatedProgressFloor)) {
    throw new RangeError('field route validated progress floor must be finite');
  }
  const stage = getStageRule(rules, routeStageId);
  if (stage.boundaryProgress + PROGRESS_EPSILON < validatedProgressFloor) {
    throw new Error(`field route progress window is inverted: ${routeStageId}`);
  }
  return Object.freeze({ floor: validatedProgressFloor, ceiling: stage.boundaryProgress });
}

export function fieldRouteGeometricProgress(
  rules: FieldRouteProgressRules,
  committedStageId: string,
  committedS: number,
): number {
  if (!Number.isFinite(committedS)) throw new RangeError('field route committed s must be finite');
  return getStageRule(rules, committedStageId).progressOffset + committedS;
}

function getStageRule(rules: FieldRouteProgressRules, stageId: string): FieldRouteProgressStageRule {
  const stage = rules.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage) throw new RangeError(`unknown field route progress stage: ${stageId}`);
  return stage;
}

function getChoiceRule(rules: FieldRouteProgressRules, choiceId: string): FieldRouteProgressChoiceRule {
  const choice = rules.choices.find((candidate) => candidate.choiceId === choiceId);
  if (!choice) throw new RangeError(`unknown field route progress choice: ${choiceId}`);
  return choice;
}

function assertTravelerView(traveler: FieldRouteProgressTravelerView): void {
  if (!Number.isFinite(traveler.committedS)) {
    throw new RangeError('field route traveler committed s must be finite');
  }
}
