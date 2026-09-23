import type { ProfileReader, ProfilePolylineReader } from '../course/geometry/profile.js';
import { rasterCoordinateToWorld, type RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from './display-scale.js';
import type { PseudoCamera } from './projection.js';

/**
 * Preserve an anchor's physical road-relative height while expressing it against the renderer's
 * piecewise-linear road surface. Physics and camera authority remain untouched.
 */
function mapPhysicalHeightToRender(
  height: ProfileReader,
  renderHeight: ProfilePolylineReader,
  s: number,
  physicalY: number,
  out: ReturnType<typeof createRenderSpacePosition>,
): number {
  const physicalRoadY = height.sample(s);
  const renderRoadY = renderHeight.sample(s, out.heightSample).y;
  return renderRoadY + (physicalY - physicalRoadY);
}

/** One road-relative mapping for every position drawn in the scene. Orientation stays physical. */
export function mapToRenderSpace(
  geometry: RasterGeometry,
  height: ProfileReader,
  renderHeight: ProfilePolylineReader,
  s: number,
  l: number,
  physicalY: number,
  out: ReturnType<typeof createRenderSpacePosition>,
) {
  rasterCoordinateToWorld(geometry.raster, s, l, out);
  out.y = mapPhysicalHeightToRender(height, renderHeight, s, physicalY, out);
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
  height: ProfileReader,
  renderHeight: ProfilePolylineReader,
  camera: PseudoCamera,
  player: { readonly course: { readonly s: number; readonly l: number } },
  position: ReturnType<typeof createRenderSpacePosition>,
  cameraPosition: ReturnType<typeof createRenderSpacePosition>,
  out: PseudoCamera,
): PseudoCamera {
  mapToRenderSpace(
    geometry,
    height,
    renderHeight,
    player.course.s,
    player.course.l,
    height.sample(player.course.s),
    position,
  );
  mapToRenderSpace(geometry, height, renderHeight, camera.s, 0, camera.y, cameraPosition);
  Object.assign(out, camera);
  out.x = position.x - CURRENT_CAMERA_DISTANCE_METERS * Math.sin(camera.yaw);
  out.y = cameraPosition.y;
  out.z = position.z - CURRENT_CAMERA_DISTANCE_METERS * Math.cos(camera.yaw);
  return out;
}
