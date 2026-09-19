import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  type GuidePathSource,
} from '../core/guide-coordinate-frame.js';
import type { SurfaceMapReader } from './surface-map.js';
import { guideEnvelopeRange } from '../core/guide-envelope.js';

/** Compile-time containment, including a stage chart's translation into its Guide's basis. */
export function validateSurfaceGuideEnvelope(frame: GuidePathSource, surface: SurfaceMapReader): void {
  const extent = surface.maxSupportedAbsL;
  const guide = guideCoordinateCurve(frame);
  if (!Number.isFinite(extent) || extent < 0) {
    throw new RangeError('SurfaceMap supported lateral envelope must be finite and nonnegative');
  }
  const limit = guideEnvelopeRange(guide.envelope).min;
  if (!(extent + Math.abs(guideCoordinateLateralOrigin(frame)) < limit)) {
    throw new RangeError(
      `supported SurfaceMap envelope |l|=${extent}, origin=${guideCoordinateLateralOrigin(frame)} must remain inside Guide chart |l|<${limit} throughout its domain`,
    );
  }
}
