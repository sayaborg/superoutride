import type { HeightProfileReader } from '../course/geometry/height-profile.js';
import { rasterCoordinateToWorld, type RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from './display-scale.js';
import type { PseudoCamera } from './projection.js';

/**
 * Preserve an anchor's physical road-relative height while expressing it against the renderer's
 * piecewise-linear road surface. Physics and camera authority remain untouched.
 */
function mapPhysicalHeightToRender(
  height: HeightProfileReader,
  s: number,
  physicalY: number,
  out: ReturnType<typeof createRenderSpacePosition>,
): number {
  const physicalRoadY = height.samplePhysics(s);
  const renderRoadY = height.sampleRender(s, out.heightSample).y;
  return renderRoadY + (physicalY - physicalRoadY);
}

/** One road-relative mapping for every position drawn in the scene. Orientation stays physical. */
export function mapToRenderSpace(
  geometry: RasterGeometry,
  height: HeightProfileReader,
  s: number,
  l: number,
  physicalY: number,
  out: ReturnType<typeof createRenderSpacePosition>,
) {
  rasterCoordinateToWorld(geometry.raster, s, l, out);
  out.y = mapPhysicalHeightToRender(height, s, physicalY, out);
  return out;
}

export function createRenderSpacePosition() {
  return {
    ...createPlanarCoordinateSample(),
    y: 0,
    heightSample: { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 },
  };
}

/** The camera follows the mapped player position along the selected physical yaw ray. */
export function createRenderSpaceCamera(
  geometry: RasterGeometry,
  height: HeightProfileReader,
  camera: PseudoCamera,
  player: { readonly course: { readonly s: number; readonly l: number } },
  position: ReturnType<typeof createRenderSpacePosition>,
  cameraPosition: ReturnType<typeof createRenderSpacePosition>,
  out: PseudoCamera,
): PseudoCamera {
  mapToRenderSpace(geometry, height, player.course.s, player.course.l, height.samplePhysics(player.course.s), position);
  mapToRenderSpace(geometry, height, camera.s, 0, camera.y, cameraPosition);
  Object.assign(out, camera);
  out.x = position.x - CURRENT_CAMERA_DISTANCE_METERS * Math.sin(camera.yaw);
  out.y = cameraPosition.y;
  out.z = position.z - CURRENT_CAMERA_DISTANCE_METERS * Math.cos(camera.yaw);
  return out;
}
