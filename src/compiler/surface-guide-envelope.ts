import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';

/** Compile-time containment, including a stage chart's translation into its Guide's basis. */
export function validateSurfaceGuideEnvelope(frame: GuideCoordinateSource, surface: SurfaceMapReader): void {
  const extent = surface.maxSupportedAbsL;
  const guide = guideCoordinateCurve(frame);
  if (!Number.isFinite(extent) || extent < 0) {
    throw new RangeError('SurfaceMap supported lateral envelope must be finite and nonnegative');
  }
  if (!(extent + Math.abs(guideCoordinateLateralOrigin(frame)) < guide.lMax)) {
    throw new RangeError(
      `supported SurfaceMap envelope |l|=${extent}, origin=${guideCoordinateLateralOrigin(frame)} must remain inside Guide chart |l|<${guide.lMax}`,
    );
  }
}
