import {
  locateWorldOnGuideCoordinateGlobal,
} from '../core/guide-coordinate-frame.js';
import type { Vec2 } from '../core/math.js';
import type { JunctionSide } from '../course/junction-cross-section.js';
import {
  observeRouteBoundaryCrossing,
} from '../gameplay/route-boundary-gates.js';
import {
  createRouteDagState,
  getRouteChoice,
  getRouteStage,
  updateRouteDag,
  type RouteDagState,
  type RouteDagUpdate,
} from '../gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
  syncRouteStageHandoffCoordinate,
  type RouteStageHandoffEvent,
  type RouteStageHandoffState,
} from '../gameplay/route-stage-handoff.js';
import type { LiveRouteRuntimeAssembly } from './live-route-runtime.js';
import {
  resolveActiveStageRuntimeContent,
  type StageRuntimeContentPackage,
} from './stage-runtime-content.js';

const EPSILON = 1e-9;

export interface LiveRouteTravelerState {
  readonly routeState: RouteDagState;
  readonly handoffState: RouteStageHandoffState;
  previousWorldPoint: Vec2;
}

export interface LiveRouteTravelerUpdate {
  readonly routeUpdate: RouteDagUpdate | null;
  readonly handoffEvent: RouteStageHandoffEvent;
  readonly committed: boolean;
}

export interface LiveRouteChoicePlanStep {
  readonly stageId: string;
  readonly choiceId: string;
}

export interface LiveRouteChoicePlan {
  readonly steps: readonly LiveRouteChoicePlanStep[];
  readonly terminalStageId: string;
}

/**
 * Independent route/chart state for any moving world-space actor.
 *
 * The traveler owns no vehicle, camera or renderer state. The caller remains responsible for
 * ordinary physics and mirrors handoffState.coordinate into its own road-coordinate cache only
 * after a returned COMMITTED event.
 */
export function createLiveRouteTravelerState(
  live: LiveRouteRuntimeAssembly,
  world: Vec2,
): LiveRouteTravelerState {
  return {
    routeState: createRouteDagState(live.route),
    handoffState: createRouteStageHandoffState(
      live.route,
      live.content,
      live.initialChart,
      world,
    ),
    previousWorldPoint: { ...world },
  };
}

/** Advance route selection and deferred chart handoff from one authoritative world-motion sample. */
export function advanceLiveRouteTraveler(
  live: LiveRouteRuntimeAssembly,
  state: LiveRouteTravelerState,
  currentWorldPoint: Vec2,
): LiveRouteTravelerUpdate {
  let routeUpdate: RouteDagUpdate | null = null;

  if (state.handoffState.pending === null) {
    const routeObservation = observeRouteBoundaryCrossing(
      live.route,
      state.routeState,
      live.gates,
      state.previousWorldPoint,
      currentWorldPoint,
    );
    routeUpdate = updateRouteDag(state.routeState, live.route, routeObservation.boundary);
    queueRouteStageHandoff(state.handoffState, live.handoffs, routeUpdate);
  }

  const handoffObservation = observePendingRouteStageHandoff(
    state.handoffState,
    live.handoffs,
    state.previousWorldPoint,
    currentWorldPoint,
  );
  const handoffEvent = commitRouteStageHandoff(
    state.handoffState,
    state.routeState,
    live.content,
    live.charts,
    handoffObservation.seam,
    currentWorldPoint,
  );
  if (handoffEvent !== 'COMMITTED') {
    syncRouteStageHandoffCoordinate(state.handoffState, live.charts, currentWorldPoint);
  }
  state.previousWorldPoint = { ...currentWorldPoint };

  return Object.freeze({
    routeUpdate,
    handoffEvent,
    committed: handoffEvent === 'COMMITTED',
  });
}

/** Recovery/resync changes observation origin only; it does not manufacture a route event. */
export function resyncLiveRouteTraveler(
  live: LiveRouteRuntimeAssembly,
  state: LiveRouteTravelerState,
  world: Vec2,
): void {
  state.previousWorldPoint = { ...world };
  syncRouteStageHandoffCoordinate(state.handoffState, live.charts, world);
}

export function resolveLiveRouteTravelerRuntime(
  live: LiveRouteRuntimeAssembly,
  state: LiveRouteTravelerState,
): StageRuntimeContentPackage {
  return resolveActiveStageRuntimeContent(live.registry, state.handoffState);
}

/**
 * Validate one deterministic route-driving intent without turning intent into route authority.
 * Physical gates remain the only source of accepted transitions.
 */
export function compileLiveRouteChoicePlan(
  live: LiveRouteRuntimeAssembly,
  choiceIds: readonly string[],
): LiveRouteChoicePlan {
  if (choiceIds.length === 0) throw new RangeError('live route choice plan must not be empty');
  const steps: LiveRouteChoicePlanStep[] = [];
  const seenChoiceIds = new Set<string>();
  let stageId = live.route.startStageId;

  for (const choiceId of choiceIds) {
    if (seenChoiceIds.has(choiceId)) throw new RangeError(`duplicate live route plan choice: ${choiceId}`);
    seenChoiceIds.add(choiceId);
    const choice = getRouteChoice(live.route, choiceId);
    if (choice.fromStageId !== stageId) {
      throw new RangeError(`live route plan choice ${choiceId} does not leave stage ${stageId}`);
    }
    steps.push(Object.freeze({ stageId, choiceId }));
    stageId = choice.toStageId;
  }

  const terminal = getRouteStage(live.route, stageId);
  if (terminal.kind !== 'TERMINAL') {
    throw new RangeError(`live route choice plan must end at a terminal stage: ${stageId}`);
  }

  return Object.freeze({
    steps: Object.freeze(steps),
    terminalStageId: terminal.id,
  });
}

/**
 * Steering target for the actor's intended next physical branch.
 *
 * Before a junction the target remains local l=0. While one road widens it moves smoothly to
 * half a child-road width, then follows the actual authored child center as the median opens.
 * This is only an AI target; physical gate crossing still decides the route.
 *
 * The committed handoff stage is authoritative here. RouteDag advances at the physical gate,
 * but the old chart/package remains active until the later physical seam COMMIT.
 */
export function sampleLiveRouteChoicePlanTargetL(
  live: LiveRouteRuntimeAssembly,
  state: LiveRouteTravelerState,
  plan: LiveRouteChoicePlan,
  s: number,
): number {
  if (state.routeState.status === 'FINISHED') return 0;
  const step = plan.steps.find((candidate) => candidate.stageId === state.handoffState.activeStageId);
  if (!step) return 0;

  const gate = live.gates.gates.find(
    (candidate) => candidate.kind === 'TRANSITION' && candidate.choiceId === step.choiceId,
  );
  if (!gate) throw new Error(`live route plan choice is missing physical gate: ${step.choiceId}`);

  const runtime = resolveLiveRouteTravelerRuntime(live, state);
  const gateCoordinate = locateWorldOnGuideCoordinateGlobal(runtime.coordinateFrame, gate.center, false);
  const finalTargetL = gateCoordinate.l;
  if (Math.abs(finalTargetL) <= EPSILON) return 0;

  const stageJunction = runtime.groundProfile.stageJunction;
  const sourceJunction = Math.abs(runtime.coordinateFrame.lateralOrigin) <= EPSILON
    ? runtime.groundProfile.junction
    : undefined;
  const junction = stageJunction ?? sourceJunction;
  if (!junction) return finalTargetL;

  const junctionS = stageJunction === junction
    ? s
    : s + (runtime.groundProfile.chainageOffsetS ?? 0);
  const side: JunctionSide = finalTargetL < 0 ? 'LEFT' : 'RIGHT';
  const sign = side === 'LEFT' ? -1 : 1;
  const authoring = junction.authoring;

  if (junctionS <= authoring.sWidenStart) return 0;
  if (junctionS < authoring.sMedianStart) {
    const t = (junctionS - authoring.sWidenStart)
      / (authoring.sMedianStart - authoring.sWidenStart);
    return sign * t * authoring.childRoadWidth * 0.5;
  }

  return junction.childCenterLAt(junctionS, side)
    ?? sign * authoring.childRoadWidth * 0.5;
}

/** One active package/chart can safely interpret the actor's sRender iff package identity matches. */
export function liveRouteTravelersShareRuntimePackage(
  a: StageRuntimeContentPackage,
  b: StageRuntimeContentPackage,
): boolean {
  return a.packageId === b.packageId;
}
