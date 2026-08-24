import { normalFromHeading } from './math.js';

/**
 * Renderer-facing camera. Chainage is already expressed on the active render
 * axis by the caller; renderer topology is intentionally absent.
 */
export interface PseudoCamera {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  s: number;
  focalLength: number;
  centerX: number;
  centerY: number;
}

export interface PseudoAnchor {
  x: number;
  y: number;
  z: number;
  s: number;
}

export interface PseudoProjection {
  x: number;
  y: number;
  scale: number;
  depth: number;
  cameraRightDistance: number;
}

/**
 * Core pseudo-depth authority: renderer chainage difference only.
 *
 * The ignored rest parameter is a temporary source-compatibility bridge for
 * DEV callers compiled before M6.44. It carries no semantic authority and is
 * never inspected; product renderer code supplies exactly two arguments.
 */
export function pseudoDepth(sObject: number, sCamera: number, ..._ignoredLegacyArgs: readonly unknown[]): number {
  return sObject - sCamera;
}

export function horizonY(camera: Pick<PseudoCamera, 'centerY' | 'focalLength' | 'pitch'>): number {
  return camera.centerY - camera.focalLength * Math.sin(camera.pitch);
}

export function pseudoProject(anchor: PseudoAnchor, camera: PseudoCamera): PseudoProjection {
  const depth = pseudoDepth(anchor.s, camera.s);
  if (!(depth > 0)) throw new RangeError('pseudoProject requires a forward anchor with d > 0');

  const cameraRight = normalFromHeading(camera.yaw);
  const dx = anchor.x - camera.x;
  const dz = anchor.z - camera.z;
  const xRight = dx * cameraRight.x + dz * cameraRight.z;
  const invDepth = 1 / depth;
  const scale = camera.focalLength * invDepth;
  const vertical = anchor.y - camera.y;

  return {
    x: camera.centerX + scale * xRight,
    y: camera.centerY
      - camera.focalLength * Math.sin(camera.pitch)
      - scale * vertical * Math.cos(camera.pitch),
    scale,
    depth,
    cameraRightDistance: xRight,
  };
}

export function straightRoadScreenX(
  centerX: number,
  focalLength: number,
  depth: number,
  theta: number,
  lateral: number,
  cameraLateral: number,
): number {
  return centerX
    - focalLength * Math.sin(theta)
    + (focalLength / depth) * (lateral - cameraLateral) * Math.cos(theta);
}
