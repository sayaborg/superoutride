import type { Vec2 } from '../core/math.js';
import type { CircuitRuntimeWindow } from '../runtime/circuit-runtime-window.js';
import {
  compileOrderedRaceCourseRules,
  createOrderedRaceProgressState,
  getOrderedRaceProgressWindow,
  resyncOrderedRaceProgress,
  updateOrderedRaceProgress,
  type OrderedRaceCourseRules,
  type OrderedRaceGateAuthoring,
  type OrderedRaceProgressState,
  type OrderedRaceProgressUpdate,
  type OrderedRaceProgressWindow,
} from './ordered-race-progress.js';

const EPSILON = 1e-8;

export interface CircuitRaceAuthoring {
  readonly id: string;
  /** Number of physically validated laps required to finish the race. */
  readonly lapCount: number;
  /** Strictly increasing one-lap checkpoint chainages in the authored (0,L) domain. */
  readonly checkpointChainages: readonly number[];
}

/**
 * Circuit product authoring compiled into one ordinary finite open ordered race.
 *
 * `startWinding` is retained only to identify the topology window used by this race. It does
 * not seed `acceptedFinishCount`, validated progress, ranking or race completion.
 */
export interface CircuitRaceRules extends OrderedRaceCourseRules {
  readonly id: string;
  readonly topologyId: string;
  readonly startWinding: number;
  readonly lapLength: number;
  readonly lapCount: number;
  readonly raceDistance: number;
  readonly windowLength: number;
}

export interface CircuitRaceProgressSample extends Vec2 {
  /** Finite monotonically increasing M6.49 runtime-window chainage. */
  readonly sWindow: number;
}

export type CircuitRaceProgressState = OrderedRaceProgressState;
export type CircuitRaceProgressUpdate = OrderedRaceProgressUpdate;
export type CircuitRaceProgressWindow = OrderedRaceProgressWindow;

/**
 * Expand one-lap circuit checkpoint authoring into a finite physical gate sequence.
 *
 * The runtime window must contain at least one complete unscored lap after the target race
 * finish. Therefore every scored FINISH, including the final one, is an ordinary interior
 * Guide seam rather than the finite open endpoint. This also leaves renderer lookahead after
 * the finish without any endpoint special case.
 */
export function compileCircuitRaceRules(
  window: CircuitRuntimeWindow,
  authoring: CircuitRaceAuthoring,
): CircuitRaceRules {
  assertNonEmpty(authoring.id, 'circuit race id');
  assertPositiveInteger(authoring.lapCount, 'circuit race lapCount');
  if (authoring.checkpointChainages.length === 0) {
    throw new RangeError('circuit race requires at least one physical checkpoint per lap');
  }

  const lapLength = window.topology.lapLength;
  let previous = 0;
  for (let i = 0; i < authoring.checkpointChainages.length; i += 1) {
    const s = authoring.checkpointChainages[i]!;
    if (!Number.isFinite(s) || !(s > 0 && s < lapLength)) {
      throw new RangeError(`circuit checkpoint ${i} must satisfy 0 < s < lapLength`);
    }
    if (i > 0 && !(s > previous)) {
      throw new RangeError('circuit checkpoint chainages must be strictly increasing');
    }
    previous = s;
  }

  // One extra complete lap is a deliberate runtime invariant. The scored final seam must be
  // an ordinary interior Guide location, never the finite open endpoint.
  if (window.repeatCount < authoring.lapCount + 1) {
    throw new RangeError('circuit runtime window must contain at least lapCount + 1 lap copies');
  }

  const raceDistance = authoring.lapCount * lapLength;
  if (!(raceDistance < window.length - EPSILON)) {
    throw new Error('circuit race finish must lie strictly inside the finite runtime window');
  }

  const gateAuthoring: OrderedRaceGateAuthoring[] = [];
  for (let lap = 0; lap < authoring.lapCount; lap += 1) {
    const base = lap * lapLength;
    for (let checkpoint = 0; checkpoint < authoring.checkpointChainages.length; checkpoint += 1) {
      gateAuthoring.push({
        kind: 'checkpoint',
        name: `L${lap + 1}_CP${checkpoint + 1}`,
        s: base + authoring.checkpointChainages[checkpoint]!,
      });
    }
    gateAuthoring.push({
      kind: 'finish',
      name: `L${lap + 1}_FINISH`,
      s: base + lapLength,
    });
  }

  const ordered = compileOrderedRaceCourseRules(window.guide, gateAuthoring);
  return Object.freeze({
    ...ordered,
    id: authoring.id,
    topologyId: window.topology.id,
    startWinding: window.startWinding,
    lapLength,
    lapCount: authoring.lapCount,
    raceDistance,
    windowLength: window.length,
  });
}

export function createCircuitRaceProgressState(
  rules: CircuitRaceRules,
  initial: CircuitRaceProgressSample,
): CircuitRaceProgressState {
  return createOrderedRaceProgressState(rules, toOrderedSample(initial));
}

export function getCircuitRaceProgressWindow(
  state: CircuitRaceProgressState,
  rules: CircuitRaceRules,
): CircuitRaceProgressWindow {
  return getOrderedRaceProgressWindow(state, rules);
}

export function updateCircuitRaceProgress(
  state: CircuitRaceProgressState,
  rules: CircuitRaceRules,
  current: CircuitRaceProgressSample,
): CircuitRaceProgressUpdate {
  return updateOrderedRaceProgress(state, rules, toOrderedSample(current));
}

export function resyncCircuitRaceProgress(
  state: CircuitRaceProgressState,
  rules: CircuitRaceRules,
  current: CircuitRaceProgressSample,
): void {
  resyncOrderedRaceProgress(state, rules, toOrderedSample(current));
}

/** Validated race laps are exactly accepted physical FINISH boundaries, never topology winding. */
export function getValidatedCircuitLapCount(state: CircuitRaceProgressState): number {
  return state.acceptedFinishCount;
}

function toOrderedSample(sample: CircuitRaceProgressSample) {
  return { x: sample.x, z: sample.z, s: sample.sWindow };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}
