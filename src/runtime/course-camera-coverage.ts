import { dot, normalFromHeading, subtract, tangentFromHeading, wrapAngle } from '../core/math.js';
import type { PlanarPose } from '../core/planar-transform.js';
import type { PseudoCamera } from '../core/projection.js';
import { courseSceneryAnchorReach, type CoursePresentation } from '../visual/course-presentation.js';

/** Actual horizontal pseudo-camera queries in one straight Port chart; height/pitch choose visible rows. */
export function courseCameraQueryBounds(
  port: PlanarPose,
  seamS: number,
  camera: PseudoCamera,
  render: { readonly width: number; readonly dMin: number; readonly dMax: number },
  presentations: readonly CoursePresentation[],
) {
  if (!port || !camera || !render || !Array.isArray(presentations))
    throw new TypeError('Camera coverage requires a Port pose, camera, render interval and presentation facets');
  const values = [
    port.x,
    port.z,
    port.heading,
    seamS,
    camera.x,
    camera.y,
    camera.z,
    camera.s,
    camera.yaw,
    camera.pitch,
    camera.focalLength,
    camera.centerX,
    camera.centerY,
    render.width,
    render.dMin,
    render.dMax,
  ];
  if (values.some((value) => typeof value !== 'number')) throw new TypeError('Camera coverage values must be numeric');
  if (
    !values.every(Number.isFinite) ||
    camera.focalLength <= 0 ||
    !Number.isSafeInteger(render.width) ||
    render.width <= 0 ||
    render.dMin <= 0 ||
    render.dMax <= render.dMin
  )
    throw new RangeError('Camera coverage requires finite forward depths and a positive viewport');
  const yaw = wrapAngle(camera.yaw - port.heading),
    cosine = Math.cos(yaw);
  if (Math.abs(yaw) >= Math.PI / 2)
    return Object.freeze({ ok: false as const, reason: 'camera_facing_unqualified' as const });
  const relative = subtract(camera, port),
    worldS = dot(relative, tangentFromHeading(port.heading)),
    worldL = dot(relative, normalFromHeading(port.heading)),
    rulerS = camera.s - seamS,
    tangent = Math.sin(yaw) / cosine;
  // Pseudo depth uses the ruler, while horizontal displacement uses the actual world camera.
  // The bilinear screen-x/depth expression has its extrema at these four rectangle corners.
  const lateral = [render.dMin, render.dMax].flatMap((depth) =>
    [0, render.width].map(
      (x) =>
        worldL + tangent * (rulerS + depth - worldS) + ((x - camera.centerX) * depth) / (camera.focalLength * cosine),
    ),
  );
  const left = Math.min(...lateral),
    right = Math.max(...lateral),
    start = rulerS + render.dMin,
    end = rulerS + render.dMax,
    reach = courseSceneryAnchorReach(presentations) / cosine;
  if (![left, right, start, end, reach].every(Number.isFinite))
    return Object.freeze({ ok: false as const, reason: 'camera_domain_exhausted' as const });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      cameraRender: Object.freeze({ start: Math.min(rulerS, start), end, left, right }),
      // The admitted source preview samples level zero without a reconstruction filter.
      groundFilter: Object.freeze({ start, end, left, right }),
      scenery: Object.freeze({ start, end, left: left - reach, right: right + reach }),
    }),
  });
}
