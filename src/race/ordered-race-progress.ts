import type { Writable } from '../core/writable.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { clamp, type Vec2 } from '../core/math.js';
import { openProfileChainage } from '../course/geometry/open-profile.js';
import {
  classifyPhysicalRaceMotionDirection,
  compilePhysicalRaceGate,
  detectPhysicalRaceGateCrossing,
  type PhysicalRaceGate,
  type PhysicalRaceGateCrossing,
  type PhysicalRaceGateKind,
  type RaceMotionDirection,
} from './physical-race-gate.js';

const RACE_PROGRESS_TOLERANCE_METERS = 1e-9;

const GATE_CANDIDATE_PADDING_METERS = 1e-7;

interface OrderedRaceGateAuthoring {
  readonly kind: PhysicalRaceGateKind;
  readonly name: string;
  /** Monotonically increasing chainage on one finite open plan coordinate. */
  readonly s: number;
  readonly bounds?: { readonly left: number; readonly right: number };
}

/**
 * Generic ordered race boundaries on a finite open plan coordinate.
 *
 * Callers reuse this physical gate sequence and own traversal or finite lap counts.
 */
interface OrderedRaceCourseRules {
  readonly coordinates: PlanCoordinateReader;
  readonly courseLength: number;
  readonly gates: readonly PhysicalRaceGate[];
}

type OrderedRaceProgressStatus = 'RUNNING' | 'FINISHED';
type OrderedRaceProgressEvent =
  | 'NONE'
  | 'CHECKPOINT'
  | 'BOUNDARY'
  | 'FINISHED'
  | 'REVERSE_CROSSING'
  | 'SHORTCUT_REJECTED'
  | 'RESYNC'
  | 'IGNORED_AFTER_FINISH';

interface OrderedRaceProgressSample extends Vec2 {
  /** Finite open chainage in [0, rules.courseLength]. Never wrapped. */
  readonly s: number;
}

interface OrderedRaceProgressWindow {
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

interface OrderedRaceProgressUpdate {
  readonly event: OrderedRaceProgressEvent;
  readonly status: OrderedRaceProgressStatus;
  readonly acceptedGate: PhysicalRaceGate | null;
  readonly acceptedCrossings: readonly PhysicalRaceGateCrossing[];
  readonly direction: RaceMotionDirection;
  readonly window: OrderedRaceProgressWindow;
  readonly justFinished: boolean;
}

/**
 * Compile an explicit finite sequence of physical race gates on one ordinary open plan coordinate.
 * Gate chainages must be strictly increasing. The final boundary must be a physical finish.
 */
export function compileOrderedRaceCourseRules(
  coordinates: PlanCoordinateReader,
  authoredGates: readonly OrderedRaceGateAuthoring[],
): OrderedRaceCourseRules {
  if (authoredGates.length === 0) throw new RangeError('ordered race requires at least one gate');

  const names = new Set<string>();
  let previousS = -Infinity;
  const gates = authoredGates.map((gate, index) => {
    if (!Number.isFinite(gate.s) || !(gate.s > 0) || gate.s > coordinates.domain.end) {
      throw new RangeError('ordered race gate chainage must satisfy 0 < s <= plan coordinate length');
    }
    if (!(gate.s > previousS)) {
      throw new RangeError('ordered race gate chainages must be strictly increasing');
    }
    previousS = gate.s;
    if (names.has(gate.name)) throw new RangeError('ordered race gate names must be unique');
    names.add(gate.name);
    return compilePhysicalRaceGate(coordinates, index, gate.kind, gate.name, gate.s, gate.bounds);
  });

  if (gates[gates.length - 1]!.kind !== 'finish') {
    throw new RangeError('ordered race final gate must be a finish');
  }

  return Object.freeze({
    coordinates,
    courseLength: coordinates.domain.end,
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
  if (normalized.s > firstGate.s + RACE_PROGRESS_TOLERANCE_METERS) {
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

function getOrderedRaceProgressWindow(
  state: OrderedRaceProgressState,
  rules: OrderedRaceCourseRules,
  out = { floor: 0, ceiling: 0 },
): OrderedRaceProgressWindow {
  if (state.status === 'FINISHED') {
    out.floor = state.validatedProgressFloor;
    out.ceiling = state.validatedProgressFloor;
    return out;
  }
  const nextGate = rules.gates[state.nextGateIndex];
  if (!nextGate) throw new Error('ordered race next gate is missing');
  if (nextGate.s + RACE_PROGRESS_TOLERANCE_METERS < state.validatedProgressFloor) {
    throw new Error('ordered race progress window is inverted');
  }
  out.floor = state.validatedProgressFloor;
  out.ceiling = nextGate.s;
  return out;
}

export function createOrderedRaceProgressWorkspace() {
  const acceptedCrossings: PhysicalRaceGateCrossing[] = [];
  const window = { floor: 0, ceiling: 0 };
  const update: Writable<OrderedRaceProgressUpdate> = {
    event: 'NONE',
    status: 'RUNNING',
    acceptedGate: null,
    acceptedCrossings,
    direction: 'STATIONARY',
    window,
    justFinished: false,
  };
  return {
    current: { x: 0, z: 0, s: 0 },
    window,
    update,
    acceptedCrossings,
    crossings: [] as PhysicalRaceGateCrossing[],
  };
}
const crossingOrder = (a: PhysicalRaceGateCrossing, b: PhysicalRaceGateCrossing) => a.u - b.u;

/**
 * Advance finite open race progress.
 *
 * Chainage has only two jobs:
 * 1. bounded interpolation inside the currently validated sector;
 * 2. disambiguating which repeated physical gate instance belongs to this finite window span.
 *
 * A gate still validates only when the actual previous→current world segment crosses its
 * transverse physical plane inside the plan coordinate envelope and in authored order.
 */
export function updateOrderedRaceProgress(
  state: OrderedRaceProgressState,
  rules: OrderedRaceCourseRules,
  currentSample: OrderedRaceProgressSample,
  accept?: (crossing: PhysicalRaceGateCrossing) => boolean,
  workspace = createOrderedRaceProgressWorkspace(),
): OrderedRaceProgressUpdate {
  const current = checkedSample(currentSample, rules.courseLength, workspace.current);
  const previous = state.previous;
  const result = workspace.update;
  workspace.acceptedCrossings.length = 0;
  state.direction = classifyPhysicalRaceMotionDirection(rules.coordinates, current.s, state.previous, current);

  if (state.status === 'FINISHED') {
    state.previous = current;
    state.lastEvent = 'IGNORED_AFTER_FINISH';
    getOrderedRaceProgressWindow(state, rules, workspace.window);
    result.event = state.lastEvent;
    result.status = state.status;
    result.acceptedGate = null;
    result.direction = state.direction;
    result.justFinished = false;
    workspace.current = previous;
    return result;
  }

  const rawDeltaS = current.s - state.previous.s;
  const interpolationDelta =
    state.direction === 'FORWARD' ? Math.max(0, rawDeltaS) : state.direction === 'REVERSE' ? Math.min(0, rawDeltaS) : 0;
  state.lastEvent = 'NONE';

  const crossings = workspace.crossings;
  crossings.length = 0;
  const pad = Math.hypot(current.x - previous.x, current.z - previous.z) + GATE_CANDIDATE_PADDING_METERS;
  const low = Math.min(previous.s, current.s) - pad,
    high = Math.max(previous.s, current.s) + pad;
  for (const gate of rules.gates)
    if (gate.s >= low && gate.s <= high) {
      const crossing = detectPhysicalRaceGateCrossing(gate, previous, current);
      if (crossing) crossings.push(crossing);
    }
  crossings.sort(crossingOrder);
  let acceptedCrossing: PhysicalRaceGateCrossing | null = null;
  const acceptedCrossings = workspace.acceptedCrossings;
  let justFinished = false;

  for (const crossing of crossings) {
    if (crossing.direction === 'REVERSE') {
      state.reverseCrossingCount += 1;
      if (state.lastEvent === 'NONE') state.lastEvent = 'REVERSE_CROSSING';
      continue;
    }

    if (crossing.gate.index !== state.nextGateIndex) {
      state.shortcutViolationCount += 1;
      state.lastEvent = 'SHORTCUT_REJECTED';
      continue;
    }

    if (accept && !accept(crossing)) break;
    acceptedCrossing = crossing;
    acceptedCrossings.push(crossing);
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

  const window = getOrderedRaceProgressWindow(state, rules, workspace.window);
  if (state.status === 'FINISHED') {
    state.sProgress = state.validatedProgressFloor;
  } else if (acceptedCrossing) {
    const residual = Math.max(0, interpolationDelta * (1 - acceptedCrossing.u));
    state.sProgress = clamp(state.validatedProgressFloor + residual, window.floor, window.ceiling);
  } else {
    state.sProgress = clamp(state.sProgress + interpolationDelta, window.floor, window.ceiling);
  }

  state.previous = current;
  workspace.current = previous;
  result.event = state.lastEvent;
  result.status = state.status;
  result.acceptedGate = acceptedCrossing?.gate ?? null;
  result.direction = state.direction;
  result.justFinished = justFinished;
  return result;
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

function checkedSample(
  sample: OrderedRaceProgressSample,
  courseLength: number,
  out = { x: 0, z: 0, s: 0 },
): OrderedRaceProgressSample {
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.z) || !Number.isFinite(sample.s)) {
    throw new RangeError('ordered race progress sample must be finite');
  }
  let s: number;
  try {
    s = openProfileChainage(sample.s, courseLength, 'ordered race progress');
  } catch (error) {
    if (error instanceof RangeError)
      throw new RangeError(
        `ordered race diagnostic: sample.s=${sample.s}, courseLength=${courseLength}`,
        { cause: error },
      );
    throw error;
  }
  out.x = sample.x;
  out.z = sample.z;
  out.s = s;
  return out;
}
