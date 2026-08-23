import {
  guideCourseToWorld,
  sampleGuideCurve,
  type GuideCurve,
} from '../core/guide-curve.js';
import {
  dot,
  normalFromHeading,
  subtract,
  tangentFromHeading,
  wrapPositive,
  type Vec2,
} from '../core/math.js';

const CROSSING_EPSILON = 1e-9;
const MOTION_EPSILON = 1e-7;

export interface GeometricCoursePosition {
  lap: number;
  sLocal: number;
}

export interface GeometricCourseTracker {
  position: GeometricCoursePosition;
  previousSLocal: number;
}

export type RaceMotionDirection = 'FORWARD' | 'REVERSE' | 'STATIONARY';
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

export interface RaceGate {
  readonly index: number;
  readonly kind: 'checkpoint' | 'finish';
  readonly name: string;
  readonly s: number;
  readonly center: Vec2;
  readonly tangent: Vec2;
  readonly normal: Vec2;
  readonly halfWidth: number;
}

export interface RaceCourseRules {
  readonly guide: GuideCurve;
  readonly courseLength: number;
  readonly gates: readonly RaceGate[];
}

export interface RaceProgressState {
  lapIndex: number;
  nextGateIndex: number;
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
}

interface GateCrossing {
  readonly gate: RaceGate;
  readonly direction: 'FORWARD' | 'REVERSE';
  readonly u: number;
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
    compileGate(guide, index, 'checkpoint', `CP${index + 1}`, s));
  gates.push(compileGate(guide, gates.length, 'finish', 'FINISH', 0));

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
  return {
    lapIndex: 0,
    nextGateIndex: 0,
    sProgress: 0,
    direction: 'STATIONARY',
    acceptedGateCount: 0,
    reverseCrossingCount: 0,
    shortcutViolationCount: 0,
    lastEvent: 'NONE',
    previous: normalizeSample(initial, rules.courseLength),
  };
}

/**
 * Validate race progress from the actual world movement segment.
 *
 * - only physical gate crossings count;
 * - gates must be crossed in authored order;
 * - reverse crossings never award progress;
 * - at most one forward gate can be accepted per physics update, so a teleport cannot
 *   validate several checkpoints/laps in one step;
 * - sProgress is updated only by accepted race gates, never directly from raw s_car.
 */
export function updateRaceProgress(
  state: RaceProgressState,
  rules: RaceCourseRules,
  currentSample: RaceProgressSample,
): RaceProgressUpdate {
  const current = normalizeSample(currentSample, rules.courseLength);
  state.direction = classifyMotionDirection(rules.guide, state.previous, current);
  state.lastEvent = 'NONE';

  const crossings = rules.gates
    .map((gate) => detectGateCrossing(gate, state.previous, current))
    .filter((crossing): crossing is GateCrossing => crossing !== null)
    .sort((a, b) => a.u - b.u);

  let acceptedGate: RaceGate | null = null;
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

    acceptedGate = crossing.gate;
    state.acceptedGateCount += 1;
    if (crossing.gate.kind === 'finish') {
      state.lapIndex += 1;
      state.nextGateIndex = 0;
      state.sProgress = state.lapIndex * rules.courseLength;
      state.lastEvent = 'LAP';
    } else {
      state.nextGateIndex += 1;
      state.sProgress = state.lapIndex * rules.courseLength + crossing.gate.s;
      state.lastEvent = 'CHECKPOINT';
    }
  }

  state.previous = current;
  return {
    event: state.lastEvent,
    acceptedGate,
    direction: state.direction,
  };
}

/** Recovery/teleport is an observation reset only; it cannot award race progress. */
export function resyncRaceProgressPosition(
  state: RaceProgressState,
  rules: RaceCourseRules,
  currentSample: RaceProgressSample,
): void {
  state.previous = normalizeSample(currentSample, rules.courseLength);
  state.direction = 'STATIONARY';
  state.lastEvent = 'RESYNC';
}

function compileGate(
  guide: GuideCurve,
  index: number,
  kind: 'checkpoint' | 'finish',
  name: string,
  s: number,
): RaceGate {
  const centerSample = guideCourseToWorld(guide, s, 0);
  const tangent = tangentFromHeading(centerSample.heading);
  const normal = normalFromHeading(centerSample.heading);
  return {
    index,
    kind,
    name,
    s: wrapPositive(s, guide.length),
    center: { x: centerSample.x, z: centerSample.z },
    tangent,
    normal,
    halfWidth: guide.lMax,
  };
}

function classifyMotionDirection(
  guide: GuideCurve,
  previous: RaceProgressSample,
  current: RaceProgressSample,
): RaceMotionDirection {
  const movement = subtract(current, previous);
  const guideSample = sampleGuideCurve(guide, current.sLocal);
  const tangent = tangentFromHeading(guideSample.heading);
  const longitudinal = dot(movement, tangent);
  if (longitudinal > MOTION_EPSILON) return 'FORWARD';
  if (longitudinal < -MOTION_EPSILON) return 'REVERSE';
  return 'STATIONARY';
}

function detectGateCrossing(
  gate: RaceGate,
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

  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const crossingPoint = {
    x: previous.x + dx * u,
    z: previous.z + dz * u,
  };
  const lateral = dot(subtract(crossingPoint, gate.center), gate.normal);
  if (Math.abs(lateral) > gate.halfWidth + CROSSING_EPSILON) return null;

  return { gate, direction, u };
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
