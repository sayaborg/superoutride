import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';

import { dot, subtract, tangentFromHeading, type Vec2 } from '../core/math.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from './world-crossing-gate.js';
const MOTION_DIRECTION_TOLERANCE_METERS = 1e-7;

export type RaceMotionDirection = 'FORWARD' | 'REVERSE' | 'STATIONARY';
export type PhysicalRaceGateKind = 'checkpoint' | 'finish';
type PhysicalRaceGateCrossingDirection = 'FORWARD' | 'REVERSE';

/**
 * One physically authored transverse race boundary on the planar chainage ruler.
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
 * Compile a physical race gate from the coordinate reader. Gate width is the coordinate domain;
 * no race-only lateral tuning authority is introduced.
 */
export function compilePhysicalRaceGate(
  coordinates: PlanCoordinateReader,
  index: number,
  kind: PhysicalRaceGateKind,
  name: string,
  s: number,
  bounds?: { readonly left: number; readonly right: number },
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
  if (!Number.isFinite(s) || s < coordinates.domain.start || s > coordinates.domain.end) {
    throw new RangeError('physical race gate chainage must be within the coordinate reader domain');
  }

  if (bounds && (![bounds.left, bounds.right].every(Number.isFinite) || bounds.right <= bounds.left))
    throw new RangeError('Gate bounds require finite positive width');
  const gateBounds = bounds ?? coordinates.domain.lateralAt(s, { left: 0, right: 0 });
  const centerSample = coordinates.toWorld(s, (gateBounds.left + gateBounds.right) / 2, createPlanCoordinateSample());
  const geometry = compileWorldCrossingGate({
    id: name,
    center: centerSample,
    heading: centerSample.heading,
    halfWidth: (gateBounds.right - gateBounds.left) / 2,
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
 * Classify actual world motion against the plan coordinate tangent at the supplied chainage.
 * Chainage selects the local tangent; world displacement remains the direction authority.
 */
export function classifyPhysicalRaceMotionDirection(
  coordinates: PlanCoordinateReader,
  currentS: number,
  previous: Vec2,
  current: Vec2,
): RaceMotionDirection {
  if (!Number.isFinite(currentS) || currentS < coordinates.domain.start || currentS > coordinates.domain.end) {
    throw new RangeError('race motion chainage must be within the coordinate reader domain');
  }
  const movement = subtract(current, previous);
  const planSample = coordinates.toWorld(currentS, 0, createPlanCoordinateSample());
  const tangent = tangentFromHeading(planSample.heading);
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
