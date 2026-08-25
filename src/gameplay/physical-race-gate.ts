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
  type Vec2,
} from '../core/math.js';

const CROSSING_EPSILON = 1e-9;
const MOTION_EPSILON = 1e-7;

export type RaceMotionDirection = 'FORWARD' | 'REVERSE' | 'STATIONARY';
export type PhysicalRaceGateKind = 'checkpoint' | 'finish';
export type PhysicalRaceGateCrossingDirection = 'FORWARD' | 'REVERSE';

/**
 * One physically authored transverse race boundary on an ordinary Guide chainage ruler.
 *
 * `s` is deliberately not wrapped here. The caller owns the coordinate domain: legacy
 * closed DEV race code may pass lap-local chainage, while finite open race code passes
 * monotonically increasing window chainage.
 */
export interface PhysicalRaceGate {
  readonly index: number;
  readonly kind: PhysicalRaceGateKind;
  readonly name: string;
  readonly s: number;
  readonly center: Vec2;
  readonly tangent: Vec2;
  readonly normal: Vec2;
  readonly halfWidth: number;
}

export interface PhysicalRaceGateCrossing {
  readonly gate: PhysicalRaceGate;
  readonly direction: PhysicalRaceGateCrossingDirection;
  /** Exact previous→current world-segment intersection fraction. */
  readonly u: number;
}

/**
 * Compile a physical race gate from the Guide itself. Gate width is the Guide envelope;
 * no race-only lateral tuning authority is introduced.
 */
export function compilePhysicalRaceGate(
  guide: GuideCurve,
  index: number,
  kind: PhysicalRaceGateKind,
  name: string,
  s: number,
): PhysicalRaceGate {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('physical race gate index must be a non-negative integer');
  }
  if (kind !== 'checkpoint' && kind !== 'finish') {
    const exhaustive: never = kind;
    throw new RangeError(`unsupported physical race gate kind: ${String(exhaustive)}`);
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new RangeError('physical race gate name must be non-empty');
  }
  if (!Number.isFinite(s) || s < 0 || s > guide.length) {
    throw new RangeError('physical race gate chainage must be within the Guide [0,length] domain');
  }

  const centerSample = guideCourseToWorld(guide, s, 0);
  const tangent = tangentFromHeading(centerSample.heading);
  const normal = normalFromHeading(centerSample.heading);
  return Object.freeze({
    index,
    kind,
    name,
    s,
    center: Object.freeze({ x: centerSample.x, z: centerSample.z }),
    tangent: Object.freeze(tangent),
    normal: Object.freeze(normal),
    halfWidth: guide.lMax,
  });
}

/**
 * Classify actual world motion against the Guide tangent at the supplied chainage.
 * Chainage selects the local tangent; world displacement remains the direction authority.
 */
export function classifyPhysicalRaceMotionDirection(
  guide: GuideCurve,
  currentS: number,
  previous: Vec2,
  current: Vec2,
): RaceMotionDirection {
  if (!Number.isFinite(currentS) || currentS < 0 || currentS > guide.length) {
    throw new RangeError('race motion chainage must be within the Guide [0,length] domain');
  }
  const movement = subtract(current, previous);
  const guideSample = sampleGuideCurve(guide, currentS);
  const tangent = tangentFromHeading(guideSample.heading);
  const longitudinal = dot(movement, tangent);
  if (longitudinal > MOTION_EPSILON) return 'FORWARD';
  if (longitudinal < -MOTION_EPSILON) return 'REVERSE';
  return 'STATIONARY';
}

/**
 * Detect a real world-segment crossing of one transverse physical gate.
 * Merely changing chainage never satisfies this function.
 */
export function detectPhysicalRaceGateCrossing(
  gate: PhysicalRaceGate,
  previous: Vec2,
  current: Vec2,
): PhysicalRaceGateCrossing | null {
  const previousRelative = subtract(previous, gate.center);
  const currentRelative = subtract(current, gate.center);
  const a0 = dot(previousRelative, gate.tangent);
  const a1 = dot(currentRelative, gate.tangent);

  let direction: PhysicalRaceGateCrossingDirection | null = null;
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

  return Object.freeze({ gate, direction, u });
}
