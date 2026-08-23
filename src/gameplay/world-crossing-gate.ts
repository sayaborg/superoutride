import {
  dot,
  normalFromHeading,
  subtract,
  tangentFromHeading,
  type Vec2,
} from '../core/math.js';

const CROSSING_EPSILON = 1e-9;

export interface WorldCrossingGateAuthoring {
  readonly id: string;
  readonly center: Vec2;
  readonly heading: number;
  readonly halfWidth: number;
}

export interface WorldCrossingGate extends WorldCrossingGateAuthoring {
  readonly tangent: Vec2;
  readonly normal: Vec2;
}

export interface WorldGateCrossing {
  readonly direction: 'FORWARD' | 'REVERSE';
  readonly u: number;
  readonly lateral: number;
}

export function compileWorldCrossingGate(source: WorldCrossingGateAuthoring): WorldCrossingGate {
  if (source.id.trim().length === 0) throw new RangeError('world crossing gate id must not be empty');
  if (![source.center.x, source.center.z, source.heading, source.halfWidth].every(Number.isFinite)) {
    throw new RangeError(`world crossing gate ${source.id} geometry must be finite`);
  }
  if (!(source.halfWidth > 0)) throw new RangeError(`world crossing gate ${source.id} halfWidth must be > 0`);
  return Object.freeze({
    ...source,
    tangent: tangentFromHeading(source.heading),
    normal: normalFromHeading(source.heading),
  });
}

/** Observe one finite world-motion segment against one oriented transverse gate. */
export function observeWorldCrossingGate(
  gate: WorldCrossingGate,
  previous: Vec2,
  current: Vec2,
): WorldGateCrossing | null {
  assertFinitePoint(previous, 'previous world-gate point');
  assertFinitePoint(current, 'current world-gate point');

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

  const crossingPoint = {
    x: previous.x + (current.x - previous.x) * u,
    z: previous.z + (current.z - previous.z) * u,
  };
  const lateral = dot(subtract(crossingPoint, gate.center), gate.normal);
  if (Math.abs(lateral) > gate.halfWidth + CROSSING_EPSILON) return null;

  return Object.freeze({ direction, u, lateral });
}

function assertFinitePoint(point: Vec2, label: string): void {
  if (![point.x, point.z].every(Number.isFinite)) throw new RangeError(`${label} must be finite`);
}
