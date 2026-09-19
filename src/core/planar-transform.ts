import { wrapAngle, type Vec2 } from './math.js';

export interface PlanarPose extends Vec2 {
  readonly heading: number;
}

/** Upright rigid X/Z transform. World Y is unchanged. */
export interface PlanarTransform {
  readonly cosine: number;
  readonly sine: number;
  readonly translation: Vec2;
}

export function transformPlanarVector(transform: PlanarTransform, vector: Vec2): Vec2 {
  return {
    x: transform.cosine * vector.x + transform.sine * vector.z,
    z: -transform.sine * vector.x + transform.cosine * vector.z,
  };
}

export function transformPlanarPoint(transform: PlanarTransform, point: Vec2): Vec2 {
  const rotated = transformPlanarVector(transform, point);
  return { x: rotated.x + transform.translation.x, z: rotated.z + transform.translation.z };
}

/** Derive destinationFromSource; neither input pose is retained. */
export function compilePlanarTransform(source: PlanarPose, destination: PlanarPose): PlanarTransform {
  for (const pose of [source, destination]) {
    if (!pose || [pose.x, pose.z, pose.heading].some((value) => typeof value !== 'number'))
      throw new TypeError('Planar pose requires numeric x, z and heading');
    if (![pose.x, pose.z, pose.heading].every(Number.isFinite)) throw new RangeError('Planar pose must be finite');
  }
  const yaw = wrapAngle(destination.heading) - wrapAngle(source.heading);
  const rotation = { cosine: Math.cos(yaw), sine: Math.sin(yaw), translation: { x: 0, z: 0 } };
  const rotated = transformPlanarVector(rotation, source);
  const x = destination.x - rotated.x,
    z = destination.z - rotated.z;
  if (![x, z].every(Number.isFinite)) throw new RangeError('Planar transform translation must be representable');
  return Object.freeze({ ...rotation, translation: Object.freeze({ x, z }) });
}

/** Inverse uses transpose(R) and -transpose(R)*t; no second authored transform. */
export function invertPlanarTransform(transform: PlanarTransform): PlanarTransform {
  const rotation = { cosine: transform.cosine, sine: -transform.sine, translation: { x: 0, z: 0 } };
  const t = transformPlanarVector(rotation, transform.translation);
  if (![t.x, t.z].every(Number.isFinite)) throw new RangeError('Inverse translation must be representable');
  return Object.freeze({ ...rotation, translation: Object.freeze({ x: -t.x, z: -t.z }) });
}

/** Apply sourceToMiddle first, then middleToDestination. */
export function composePlanarTransforms(
  middleToDestination: PlanarTransform,
  sourceToMiddle: PlanarTransform,
): PlanarTransform {
  const translation = transformPlanarPoint(middleToDestination, sourceToMiddle.translation);
  const cosine = middleToDestination.cosine * sourceToMiddle.cosine - middleToDestination.sine * sourceToMiddle.sine;
  const sine = middleToDestination.sine * sourceToMiddle.cosine + middleToDestination.cosine * sourceToMiddle.sine;
  if (![translation.x, translation.z, cosine, sine].every(Number.isFinite))
    throw new RangeError('Composed planar transform must be representable');
  return Object.freeze({ cosine, sine, translation: Object.freeze(translation) });
}
