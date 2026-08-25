import type { GuideCurve } from '../core/guide-curve.js';
import { clamp, type Vec2 } from '../core/math.js';
import {
  classifyPhysicalRaceMotionDirection,
  compilePhysicalRaceGate,
  detectPhysicalRaceGateCrossing,
  type PhysicalRaceGate,
  type PhysicalRaceGateCrossing,
  type PhysicalRaceGateKind,
  type RaceMotionDirection,
} from './physical-race-gate.js';

const EPSILON = 1e-9;
const CANDIDATE_EPSILON = 1e-7;

export interface OrderedRaceGateAuthoring {
  readonly kind: PhysicalRaceGateKind;
  readonly name: string;
  /** Monotonically increasing chainage on one finite open Guide. */
  readonly s: number;
}

/**
 * Generic ordered race boundaries on a finite open Guide.
 *
 * There is no lap length, modulo rule or topology flag here. A circuit compiler may expand
 * lap-local authoring into this ordinary finite gate sequence before runtime.
 */
export interface OrderedRaceCourseRules {
  readonly guide: GuideCurve;
  readonly courseLength: number;
  readonly gates: readonly PhysicalRaceGate[];
}

export type OrderedRaceProgressStatus = 'RUNNING' | 'FINISHED';
export type OrderedRaceProgressEvent =
  | 'NONE'
  | 'CHECKPOINT'
  | 'BOUNDARY'
  | 'FINISHED'
  | 'REVERSE_CROSSING'
  | 'SHORTCUT_REJECTED'
  | 'RESYNC'
  | 'IGNORED_AFTER_FINISH';

export interface OrderedRaceProgressSample extends Vec2 {
  /** Finite open chainage in [0, rules.courseLength]. Never wrapped. */
  readonly s: number;
}

export interface OrderedRaceProgressWindow {
  readonly floor: number;
  readonly ceiling: number;
}

export interface OrderedRaceProgressState {
  status: OrderedRaceProgressStatus;
  nextGateIndex: number;
  /** Last physically accepted gate chainage. */
  validatedProgressFloor: number;
  /** Continuous ranking progress bounded by [floor,next required gate]. */
  sProgress: number;
  direction: RaceMotionDirection;
  acceptedGateCount: number;
  /** Count of physically accepted `finish` boundaries. */
  acceptedFinishCount: number;
  reverseCrossingCount: number;
  shortcutViolationCount: number;
  lastEvent: OrderedRaceProgressEvent;
  previous: OrderedRaceProgressSample;
}

export interface OrderedRaceProgressUpdate {
  readonly event: OrderedRaceProgressEvent;
  readonly status: OrderedRaceProgressStatus;
  readonly acceptedGate: PhysicalRaceGate | null;
  readonly direction: RaceMotionDirection;
  readonly window: OrderedRaceProgressWindow;
  readonly justFinished: boolean;
}

/**
 * Compile an explicit finite sequence of physical race gates on one ordinary open Guide.
 * Gate chainages must be strictly increasing. The final boundary must be a physical finish.
 */
export function compileOrderedRaceCourseRules(
  guide: GuideCurve,
  authoredGates: readonly OrderedRaceGateAuthoring[],
): OrderedRaceCourseRules {
  if (authoredGates.length === 0) throw new RangeError('ordered race requires at least one gate');

  const names = new Set<string>();
  let previousS = -Infinity;
  const gates = authoredGates.map((gate, index) => {
    if (!Number.isFinite(gate.s) || !(gate.s > 0) || gate.s > guide.length) {
      throw new RangeError('ordered race gate chainage must satisfy 0 < s <= Guide length');
    }
    if (!(gate.s > previousS)) {
      throw new RangeError('ordered race gate chainages must be strictly increasing');
    }
    previousS = gate.s;
    if (names.has(gate.name)) throw new RangeError('ordered race gate names must be unique');
    names.add(gate.name);
    return compilePhysicalRaceGate(guide, index, gate.kind, gate.name, gate.s);
  });

  if (gates[gates.length - 1]!.kind !== 'finish') {
    throw new RangeError('ordered race final gate must be a finish');
  }

  return Object.freeze({
    guide,
    courseLength: guide.length,
    gates: Object.freeze(gates),
  });
}

export function createOrderedRaceProgressState(
  rules: OrderedRaceCourseRules,
  initial: OrderedRaceProgressSample,
): OrderedRaceProgressState {
  const normalized = checkedSample(initial, rules.courseLength);
  const firstGate = rules.gates[0];
  if (!firstGate) throw new Error('ordered race rules require a gate');
  if (normalized.s > firstGate.s + EPSILON) {
    throw new RangeError('ordered race initial sample must be inside the first unvalidated sector');
  }
  return {
    status: 'RUNNING',
    nextGateIndex: 0,
    validatedProgressFloor: 0,
    sProgress: normalized.s,
    direction: 'STATIONARY',
    acceptedGateCount: 0,
    acceptedFinishCount: 0,
    reverseCrossingCount: 0,
    shortcutViolationCount: 0,
    lastEvent: 'NONE',
    previous: normalized,
  };
}

export function getOrderedRaceProgressWindow(
  state: OrderedRaceProgressState,
  rules: OrderedRaceCourseRules,
): OrderedRaceProgressWindow {
  if (state.status === 'FINISHED') {
    return { floor: state.validatedProgressFloor, ceiling: state.validatedProgressFloor };
  }
  const nextGate = rules.gates[state.nextGateIndex];
  if (!nextGate) throw new Error('ordered race next gate is missing');
  if (nextGate.s + EPSILON < state.validatedProgressFloor) {
    throw new Error('ordered race progress window is inverted');
  }
  return { floor: state.validatedProgressFloor, ceiling: nextGate.s };
}

/**
 * Advance finite open race progress.
 *
 * Chainage has only two jobs:
 * 1. bounded interpolation inside the currently validated sector;
 * 2. disambiguating which repeated physical gate instance belongs to this finite window span.
 *
 * A gate still validates only when the actual previous→current world segment crosses its
 * transverse physical plane inside the Guide envelope and in authored order.
 */
export function updateOrderedRaceProgress(
  state: OrderedRaceProgressState,
  rules: OrderedRaceCourseRules,
  currentSample: OrderedRaceProgressSample,
): OrderedRaceProgressUpdate {
  const current = checkedSample(currentSample, rules.courseLength);
  state.direction = classifyPhysicalRaceMotionDirection(rules.guide, current.s, state.previous, current);

  if (state.status === 'FINISHED') {
    state.previous = current;
    state.lastEvent = 'IGNORED_AFTER_FINISH';
    const window = getOrderedRaceProgressWindow(state, rules);
    return {
      event: state.lastEvent,
      status: state.status,
      acceptedGate: null,
      direction: state.direction,
      window,
      justFinished: false,
    };
  }

  const rawDeltaS = current.s - state.previous.s;
  const interpolationDelta = state.direction === 'FORWARD'
    ? Math.max(0, rawDeltaS)
    : state.direction === 'REVERSE' ? Math.min(0, rawDeltaS) : 0;
  state.lastEvent = 'NONE';

  const crossings = candidateGates(rules.gates, state.previous, current)
    .map((gate) => detectPhysicalRaceGateCrossing(gate, state.previous, current))
    .filter((crossing): crossing is PhysicalRaceGateCrossing => crossing !== null)
    .sort((a, b) => a.u - b.u);

  let acceptedCrossing: PhysicalRaceGateCrossing | null = null;
  let forwardCrossingSeen = false;
  let justFinished = false;

  for (const crossing of crossings) {
    if (crossing.direction === 'REVERSE') {
      state.reverseCrossingCount += 1;
      if (state.lastEvent === 'NONE') state.lastEvent = 'REVERSE_CROSSING';
      continue;
    }

    if (forwardCrossingSeen) {
      state.shortcutViolationCount += 1;
      state.lastEvent = 'SHORTCUT_REJECTED';
      continue;
    }
    forwardCrossingSeen = true;

    if (crossing.gate.index !== state.nextGateIndex) {
      state.shortcutViolationCount += 1;
      state.lastEvent = 'SHORTCUT_REJECTED';
      continue;
    }

    acceptedCrossing = crossing;
    state.acceptedGateCount += 1;
    state.validatedProgressFloor = crossing.gate.s;
    state.nextGateIndex += 1;

    if (crossing.gate.kind === 'finish') {
      state.acceptedFinishCount += 1;
      if (state.nextGateIndex === rules.gates.length) {
        state.status = 'FINISHED';
        state.lastEvent = 'FINISHED';
        justFinished = true;
      } else {
        state.lastEvent = 'BOUNDARY';
      }
    } else {
      state.lastEvent = 'CHECKPOINT';
    }
  }

  const window = getOrderedRaceProgressWindow(state, rules);
  if (state.status === 'FINISHED') {
    state.sProgress = state.validatedProgressFloor;
  } else if (acceptedCrossing) {
    const residual = Math.max(0, interpolationDelta * (1 - acceptedCrossing.u));
    state.sProgress = clamp(state.validatedProgressFloor + residual, window.floor, window.ceiling);
  } else {
    state.sProgress = clamp(state.sProgress + interpolationDelta, window.floor, window.ceiling);
  }

  state.previous = current;
  return {
    event: state.lastEvent,
    status: state.status,
    acceptedGate: acceptedCrossing?.gate ?? null,
    direction: state.direction,
    window,
    justFinished,
  };
}

/** Recovery/teleport changes observation origin only; no gate or progress is awarded. */
export function resyncOrderedRaceProgress(
  state: OrderedRaceProgressState,
  rules: OrderedRaceCourseRules,
  currentSample: OrderedRaceProgressSample,
): void {
  state.previous = checkedSample(currentSample, rules.courseLength);
  state.direction = 'STATIONARY';
  state.lastEvent = 'RESYNC';
}

function candidateGates(
  gates: readonly PhysicalRaceGate[],
  previous: OrderedRaceProgressSample,
  current: OrderedRaceProgressSample,
): PhysicalRaceGate[] {
  // Window chainage identifies the logical copy of repeated world geometry. Expand the
  // interval by actual world travel so a small Guide projection lag cannot hide a real gate.
  const worldTravel = Math.hypot(current.x - previous.x, current.z - previous.z);
  const pad = worldTravel + CANDIDATE_EPSILON;
  const low = Math.min(previous.s, current.s) - pad;
  const high = Math.max(previous.s, current.s) + pad;
  return gates.filter((gate) => gate.s >= low && gate.s <= high);
}

function checkedSample(
  sample: OrderedRaceProgressSample,
  courseLength: number,
): OrderedRaceProgressSample {
  if (![sample.x, sample.z, sample.s].every(Number.isFinite)) {
    throw new RangeError('ordered race progress sample must be finite');
  }
  if (sample.s < -EPSILON || sample.s > courseLength + EPSILON) {
    throw new RangeError('ordered race progress chainage is outside the finite open Guide domain');
  }
  const s = Math.abs(sample.s) <= EPSILON
    ? 0
    : Math.abs(sample.s - courseLength) <= EPSILON ? courseLength : sample.s;
  return { x: sample.x, z: sample.z, s };
}
