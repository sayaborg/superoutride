import { guidePathToWorld, sampleGuidePath, type GuidePath } from '../core/guide-curve.js';
import { dot, subtract, tangentFromHeading, type Vec2 } from '../core/math.js';

import { compileWorldCrossingGate, observeWorldCrossingGate } from './world-crossing-gate.js';
const MOTION_DIRECTION_TOLERANCE_METERS = 1e-7;

export type RaceMotionDirection = 'FORWARD' | 'REVERSE' | 'STATIONARY';
export type PhysicalRaceGateKind = 'checkpoint' | 'finish';
export type PhysicalRaceGateCrossingDirection = 'FORWARD' | 'REVERSE';

/**
 * One physically authored transverse race boundary on an ordinary Guide chainage ruler.
 *
 * The caller supplies chainage in the finite coordinate window. The gate never wraps it.
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
  guide: GuidePath,
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

  const centerSample = guidePathToWorld(guide, s, 0);
  const geometry = compileWorldCrossingGate({
    id: name,
    center: centerSample,
    heading: centerSample.heading,
    halfWidth: guide.lMax,
  });
  return Object.freeze({
    index,
    kind,
    name,
    s,
    center: geometry.center,
    tangent: geometry.tangent,
    normal: geometry.normal,
    halfWidth: geometry.halfWidth,
  });
}

/**
 * Classify actual world motion against the Guide tangent at the supplied chainage.
 * Chainage selects the local tangent; world displacement remains the direction authority.
 */
export function classifyPhysicalRaceMotionDirection(
  guide: GuidePath,
  currentS: number,
  previous: Vec2,
  current: Vec2,
): RaceMotionDirection {
  if (!Number.isFinite(currentS) || currentS < 0 || currentS > guide.length) {
    throw new RangeError('race motion chainage must be within the Guide [0,length] domain');
  }
  const movement = subtract(current, previous);
  const guideSample = sampleGuidePath(guide, currentS);
  const tangent = tangentFromHeading(guideSample.heading);
  const longitudinal = dot(movement, tangent);
  if (longitudinal > MOTION_DIRECTION_TOLERANCE_METERS) return 'FORWARD';
  if (longitudinal < -MOTION_DIRECTION_TOLERANCE_METERS) return 'REVERSE';
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
  const crossing = observeWorldCrossingGate(gate, previous, current);
  return crossing === null ? null : Object.freeze({ gate, direction: crossing.direction, u: crossing.u });
}
