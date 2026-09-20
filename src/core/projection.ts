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

interface PseudoAnchor {
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

/** Core pseudo-depth authority: renderer chainage difference only. */
export function pseudoDepth(sObject: number, sCamera: number): number {
  return sObject - sCamera;
}

export function horizonY(camera: Pick<PseudoCamera, 'centerY' | 'focalLength' | 'pitch'>): number {
  return camera.centerY - camera.focalLength * Math.sin(camera.pitch);
}

export function pseudoProject(
  anchor: PseudoAnchor,
  camera: PseudoCamera,
  out: PseudoProjection = { x: 0, y: 0, scale: 0, depth: 0, cameraRightDistance: 0 },
): PseudoProjection {
  const depth = pseudoDepth(anchor.s, camera.s);
  if (!(depth > 0)) throw new RangeError('pseudoProject requires a forward anchor with d > 0');

  const dx = anchor.x - camera.x;
  const dz = anchor.z - camera.z;
  const xRight = dx * Math.cos(camera.yaw) + dz * -Math.sin(camera.yaw);
  const invDepth = 1 / depth;
  const scale = camera.focalLength * invDepth;
  const vertical = anchor.y - camera.y;

  out.x = camera.centerX + scale * xRight;
  out.y = horizonY(camera) - scale * vertical * Math.cos(camera.pitch);
  out.scale = scale;
  out.depth = depth;
  out.cameraRightDistance = xRight;
  return out;
}
