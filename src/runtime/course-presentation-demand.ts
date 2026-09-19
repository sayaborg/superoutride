import type { CameraProfile } from '../camera/camera.js';
import type { CourseQueryExtent } from '../compiler/course-consumer-demand.js';
import { courseSceneryAnchorReach, type CoursePresentation } from '../visual/course-presentation.js';

/**
 * Conservative straight-guard query containment for the ordinary chase camera/pseudo renderer.
 * Height/pitch affect visible rows, not this horizontal bound. Filter support remains an explicit input.
 */
export function coursePresentationDemand(
  pose: CourseQueryExtent,
  step: CourseQueryExtent,
  camera: Pick<CameraProfile, 'dCam' | 'focalLength' | 'centerX'>,
  render: { readonly width: number; readonly dMin: number; readonly dMax: number },
  maxYawFromPort: number,
  filter: { readonly chainageRadius: number; readonly lateralRadius: number },
  presentations: readonly CoursePresentation[],
) {
  if (!pose || !step || !camera || !render || !filter || !Array.isArray(presentations))
    throw new TypeError('Presentation demand requires explicit pose, step, camera, render, filter and content');
  const extents = [pose, step].flatMap((e) => [e.behind, e.ahead, e.left, e.right]);
  const values = [
    ...extents,
    camera.dCam,
    camera.focalLength,
    camera.centerX,
    render.width,
    render.dMin,
    render.dMax,
    maxYawFromPort,
    filter.chainageRadius,
    filter.lateralRadius,
  ];
  if (values.some((v) => typeof v !== 'number')) throw new TypeError('Presentation demand values must be numeric');
  if (
    !values.every(Number.isFinite) ||
    extents.some((v) => v < 0) ||
    camera.dCam < 0 ||
    camera.focalLength <= 0 ||
    !Number.isSafeInteger(render.width) ||
    render.width <= 0 ||
    render.dMin <= 0 ||
    render.dMax <= render.dMin ||
    maxYawFromPort < 0 ||
    maxYawFromPort >= Math.PI / 2 ||
    filter.chainageRadius < 0 ||
    filter.lateralRadius < 0
  )
    throw new RangeError('Presentation demand needs a finite forward-facing camera and nonnegative extents');
  const cos = Math.cos(maxYawFromPort),
    sin = Math.sin(maxYawFromPort);
  const ds = Math.max(Math.abs(render.dMin - camera.dCam), Math.abs(render.dMax - camera.dCam));
  const x = Math.max(Math.abs(camera.centerX), Math.abs(render.width - camera.centerX));
  // xr = cos(yaw)*(l-lVehicle) - sin(yaw)*(s-sVehicle). The chase offset cancels.
  // Screen edges conservatively contain all queried pixel centres and the full viewport.
  const lateral = ((x * render.dMax) / camera.focalLength + sin * ds) / cos;
  const footprint = Object.freeze({
    behind: camera.dCam,
    ahead: Math.max(0, render.dMax - camera.dCam),
    left: lateral,
    right: lateral,
  });
  const anchorReach = courseSceneryAnchorReach(presentations) / cos;
  const groundFilter = Object.freeze({
    behind: footprint.behind + filter.chainageRadius,
    ahead: footprint.ahead + filter.chainageRadius,
    left: lateral + filter.lateralRadius,
    right: lateral + filter.lateralRadius,
  });
  const scenery = Object.freeze({ ...footprint, left: lateral + anchorReach, right: lateral + anchorReach });
  if (![...Object.values(groundFilter), ...Object.values(scenery)].every(Number.isFinite))
    throw new RangeError('Expanded presentation footprint must remain representable');
  return Object.freeze({
    pose: Object.freeze({ ...pose }),
    step: Object.freeze({ ...step }),
    consumers: Object.freeze({ cameraRender: footprint, groundFilter, scenery }),
  });
}
