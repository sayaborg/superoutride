import { normalFromHeading, wrapSigned } from './math.js';

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
  courseLength: number;
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

export function pseudoDepth(sObject: number, sCamera: number, courseLength: number): number {
  return wrapSigned(sObject - sCamera, courseLength);
}

export function horizonY(camera: Pick<PseudoCamera, 'centerY' | 'focalLength' | 'pitch'>): number {
  return camera.centerY - camera.focalLength * Math.sin(camera.pitch);
}

export function pseudoProject(anchor: PseudoAnchor, camera: PseudoCamera): PseudoProjection {
  const depth = pseudoDepth(anchor.s, camera.s, camera.courseLength);
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
