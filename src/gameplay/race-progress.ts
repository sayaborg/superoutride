import type { GuideCurve } from '../core/guide-curve.js';
import {
  clamp,
  wrapPositive,
  wrapSigned,
  type Vec2,
} from '../core/math.js';
import {
  classifyPhysicalRaceMotionDirection,
  compilePhysicalRaceGate,
  detectPhysicalRaceGateCrossing,
  type PhysicalRaceGate,
  type PhysicalRaceGateCrossing,
  type RaceMotionDirection as PhysicalRaceMotionDirection,
} from './physical-race-gate.js';

const CROSSING_EPSILON = 1e-9;

export interface GeometricCoursePosition {
  lap: number;
  sLocal: number;
}

export interface GeometricCourseTracker {
  position: GeometricCoursePosition;
  previousSLocal: number;
}

export type RaceMotionDirection = PhysicalRaceMotionDirection;
export type RaceProgressEvent =
  | 'NONE'
  | 'CHECKPOINT'
  | 'LAP'
  | 'REVERSE_CROSSING'
  | 'SHORTCUT_REJECTED'
  | 'RESYNC';

export interface RaceProgressSample extends Vec2 {
  sLocal: number;
}

/** Backward-compatible name for the shared physical gate primitive. */
export type RaceGate = PhysicalRaceGate;

export interface RaceCourseRules {
  readonly guide: GuideCurve;
  readonly courseLength: number;
  readonly gates: readonly RaceGate[];
}

export interface RaceProgressWindow {
  readonly floor: number;
  readonly ceiling: number;
}

export interface RaceProgressState {
  lapIndex: number;
  nextGateIndex: number;
  /** Last physically validated checkpoint/finish progress. Never moves from raw s alone. */
  validatedProgressFloor: number;
  /** Continuous ranking progress, strictly bounded by the current validated sector. */
  sProgress: number;
  direction: RaceMotionDirection;
  acceptedGateCount: number;
  reverseCrossingCount: number;
  shortcutViolationCount: number;
  lastEvent: RaceProgressEvent;
  previous: RaceProgressSample;
}

export interface RaceProgressUpdate {
  readonly event: RaceProgressEvent;
  readonly acceptedGate: RaceGate | null;
  readonly direction: RaceMotionDirection;
  readonly window: RaceProgressWindow;
}

/**
 * Compile explicit ordered checkpoints into physical world-space transverse gates.
 * Finish is fixed at s=0. Gate width is the Guide authoring envelope; M6 adds no
 * independent race-only width knob.
 */
export function compileRaceCourseRules(
  guide: GuideCurve,
  checkpointChainages: readonly number[],
): RaceCourseRules {
  let previous = 0;
  for (let i = 0; i < checkpointChainages.length; i += 1) {
    const s = checkpointChainages[i]!;
    if (!(s > 0 && s < guide.length) || !Number.isFinite(s)) {
      throw new RangeError(`checkpoint ${i} must satisfy 0 < s < courseLength`);
    }
    if (i > 0 && !(s > previous)) {
      throw new RangeError('checkpoint chainages must be strictly increasing');
    }
    previous = s;
  }

  const gates: RaceGate[] = checkpointChainages.map((s, index) =>
    compilePhysicalRaceGate(guide, index, 'checkpoint', `CP${index + 1}`, s));
  gates.push(compilePhysicalRaceGate(guide, gates.length, 'finish', 'FINISH', 0));

  return {
    guide,
    courseLength: guide.length,
    gates,
  };
}

/** DEV race rule: three explicit quarter-lap checkpoints plus the fixed s=0 finish. */
export function createM6DebugRaceRules(guide: GuideCurve): RaceCourseRules {
  return compileRaceCourseRules(guide, [
    guide.length * 0.25,
    guide.length * 0.50,
    guide.length * 0.75,
  ]);
}

export function createGeometricCourseTracker(
  courseLength: number,
  initialSLocal: number,
): GeometricCourseTracker {
  const sLocal = wrapPositive(initialSLocal, courseLength);
  return {
    position: { lap: 0, sLocal },
    previousSLocal: sLocal,
  };
}

/**
 * Geometry-only lap + local-s tracker from Core §5. It is deliberately not race authority.
 * The seam decision assumes ordinary frame-to-frame continuity; recovery/teleport callers
 * should resync instead of feeding a discontinuity through this function.
 */
export function updateGeometricCourseTracker(
  tracker: GeometricCourseTracker,
  courseLength: number,
  currentSLocal: number,
): GeometricCoursePosition {
  const current = wrapPositive(currentSLocal, courseLength);
  const rawDelta = current - tracker.previousSLocal;
  const half = courseLength * 0.5;
  if (rawDelta < -half) tracker.position.lap += 1;
  else if (rawDelta > half) tracker.position.lap -= 1;
  tracker.position.sLocal = current;
  tracker.previousSLocal = current;
  return tracker.position;
}

export function resyncGeometricCourseTracker(
  tracker: GeometricCourseTracker,
  courseLength: number,
  currentSLocal: number,
): void {
  const current = wrapPositive(currentSLocal, courseLength);
  tracker.position.sLocal = current;
  tracker.previousSLocal = current;
}

export function createRaceProgressState(
  rules: RaceCourseRules,
  initial: RaceProgressSample,
): RaceProgressState {
  const normalized = normalizeSample(initial, rules.courseLength);
  const firstGate = rules.gates[0];
  if (!firstGate) throw new Error('race rules require at least the finish gate');
  const firstCeiling = firstGate.kind === 'finish' ? rules.courseLength : firstGate.s;
  // The initial spawn may be placed inside sector 0 (the current DEV spawn is s=45m).
  // Only that first validated sector is eligible for initialization from geometric s.
  const initialProgress = normalized.sLocal <= firstCeiling ? normalized.sLocal : 0;
  return {
    lapIndex: 0,
    nextGateIndex: 0,
    validatedProgressFloor: 0,
    sProgress: initialProgress,
    direction: 'STATIONARY',
    acceptedGateCount: 0,
    reverseCrossingCount: 0,
    shortcutViolationCount: 0,
    lastEvent: 'NONE',
    previous: normalized,
  };
}

/** Current legal continuous ranking interval established by accepted physical gates. */
export function getRaceProgressWindow(
  state: RaceProgressState,
  rules: RaceCourseRules,
): RaceProgressWindow {
  const nextGate = rules.gates[state.nextGateIndex];
  if (!nextGate) throw new Error('next race gate is missing');
  const ceiling = nextGate.kind === 'finish'
    ? (state.lapIndex + 1) * rules.courseLength
    : state.lapIndex * rules.courseLength + nextGate.s;
  if (ceiling + CROSSING_EPSILON < state.validatedProgressFloor) {
    throw new Error('race progress window is inverted');
  }
  return { floor: state.validatedProgressFloor, ceiling };
}

/**
 * Validate race progress from the actual world movement segment.
 *
 * Gate authority:
 * - only physical gate crossings count;
 * - gates must be crossed in authored order;
 * - reverse crossings never validate a gate;
 * - at most one forward gate can be accepted per physics update.
 *
 * Continuous M6.1 ranking:
 * - raw chainage contributes only a frame-to-frame interpolation delta;
 * - the delta sign must agree with actual world motion direction;
 * - interpolation is clamped to [last validated gate, next required gate];
 * - therefore raw s_car can never cross a checkpoint/lap boundary by itself.
 */
export function updateRaceProgress(
  state: RaceProgressState,
  rules: RaceCourseRules,
  currentSample: RaceProgressSample,
): RaceProgressUpdate {
  const current = normalizeSample(currentSample, rules.courseLength);
  const rawDeltaS = wrapSigned(current.sLocal - state.previous.sLocal, rules.courseLength);
  state.direction = classifyPhysicalRaceMotionDirection(
    rules.guide,
    current.sLocal,
    state.previous,
    current,
  );
  const interpolationDelta = state.direction === 'FORWARD'
    ? Math.max(0, rawDeltaS)
    : state.direction === 'REVERSE' ? Math.min(0, rawDeltaS) : 0;
  state.lastEvent = 'NONE';

  const crossings = rules.gates
    .map((gate) => detectPhysicalRaceGateCrossing(gate, state.previous, current))
    .filter((crossing): crossing is PhysicalRaceGateCrossing => crossing !== null)
    .sort((a, b) => a.u - b.u);

  let acceptedCrossing: PhysicalRaceGateCrossing | null = null;
  let forwardCrossingSeen = false;

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
    if (crossing.gate.kind === 'finish') {
      state.lapIndex += 1;
      state.nextGateIndex = 0;
      state.validatedProgressFloor = state.lapIndex * rules.courseLength;
      state.lastEvent = 'LAP';
    } else {
      state.validatedProgressFloor = state.lapIndex * rules.courseLength + crossing.gate.s;
      state.nextGateIndex += 1;
      state.lastEvent = 'CHECKPOINT';
    }
  }

  const window = getRaceProgressWindow(state, rules);
  if (acceptedCrossing) {
    // Preserve the fraction of this physics step that occurred after the accepted gate.
    // This prevents a permanent one-tick ranking lag while keeping the new sector bounded.
    const residual = Math.max(0, interpolationDelta * (1 - acceptedCrossing.u));
    state.sProgress = clamp(state.validatedProgressFloor + residual, window.floor, window.ceiling);
  } else {
    state.sProgress = clamp(state.sProgress + interpolationDelta, window.floor, window.ceiling);
  }

  state.previous = current;
  return {
    event: state.lastEvent,
    acceptedGate: acceptedCrossing?.gate ?? null,
    direction: state.direction,
    window,
  };
}

/** Recovery/teleport is an observation reset only; it cannot award or move race progress. */
export function resyncRaceProgressPosition(
  state: RaceProgressState,
  rules: RaceCourseRules,
  currentSample: RaceProgressSample,
): void {
  state.previous = normalizeSample(currentSample, rules.courseLength);
  state.direction = 'STATIONARY';
  state.lastEvent = 'RESYNC';
}

function normalizeSample(sample: RaceProgressSample, courseLength: number): RaceProgressSample {
  if (![sample.x, sample.z, sample.sLocal].every(Number.isFinite)) {
    throw new RangeError('race progress sample must be finite');
  }
  return {
    x: sample.x,
    z: sample.z,
    sLocal: wrapPositive(sample.sLocal, courseLength),
  };
}
