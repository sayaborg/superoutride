import type { PseudoCamera } from '../core/projection.js';
import type { HeightProfileReader } from '../visual/height-profile.js';

/**
 * Preserve an anchor's physical road-relative height while expressing it against the renderer's
 * piecewise-linear road surface. Physics and camera authority remain untouched.
 */
export function mapPhysicalHeightToRender(
  height: HeightProfileReader,
  s: number,
  physicalY: number,
): number {
  const physicalRoadY = height.samplePhysics(s);
  const renderRoadY = height.sampleRender(s).y;
  return renderRoadY + (physicalY - physicalRoadY);
}

/** Create the renderer-only camera counterpart at the same road-relative height. */
export function createRenderSpaceCamera(
  height: HeightProfileReader,
  camera: PseudoCamera,
): PseudoCamera {
  return {
    ...camera,
    y: mapPhysicalHeightToRender(height, camera.s, camera.y),
  };
}
