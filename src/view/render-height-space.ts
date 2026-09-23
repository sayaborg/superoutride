import type { HeightProfileReader } from '../course/geometry/height-profile.js';
import { rasterCoordinateToWorld, type RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import type { PseudoCamera } from './projection.js';

/**
 * Preserve an anchor's physical road-relative height while expressing it against the renderer's
 * piecewise-linear road surface. Physics and camera authority remain untouched.
 */
function mapPhysicalHeightToRender(height: HeightProfileReader, s: number, physicalY: number): number {
  const physicalRoadY = height.samplePhysics(s);
  const renderRoadY = height.sampleRender(s).y;
  return renderRoadY + (physicalY - physicalRoadY);
}

/** One road-relative mapping for every position drawn in the scene. Orientation stays physical. */
export function mapToRenderSpace(
  geometry: RasterGeometry,
  height: HeightProfileReader,
  s: number,
  l: number,
  physicalY: number,
) {
  const plan = rasterCoordinateToWorld(geometry.raster, s, l, createPlanarCoordinateSample());
  return { x: plan.x, y: mapPhysicalHeightToRender(height, s, physicalY), z: plan.z, s };
}

/** The camera follows the mapped player position along the selected physical yaw ray. */
export function createRenderSpaceCamera(
  geometry: RasterGeometry,
  height: HeightProfileReader,
  camera: PseudoCamera,
  player: { readonly course: { readonly s: number; readonly l: number } },
): PseudoCamera {
  const position = mapToRenderSpace(
    geometry,
    height,
    player.course.s,
    player.course.l,
    height.samplePhysics(player.course.s),
  );
  return {
    ...camera,
    x: position.x - (player.course.s - camera.s) * Math.sin(camera.yaw),
    y: mapToRenderSpace(geometry, height, camera.s, 0, camera.y).y,
    z: position.z - (player.course.s - camera.s) * Math.cos(camera.yaw),
  };
}
