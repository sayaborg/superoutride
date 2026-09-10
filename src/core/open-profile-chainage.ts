import { SOURCE_ENDPOINT_TOLERANCE_METERS } from './tolerances.js';
/** Absolute source-domain endpoint tolerance in metres; never a topology/wrapping rule. */

/** Source-profile endpoint normalization; length is validated by the owning source constructor.
 * Raster/Guide sampling has a separate geometric tolerance. Never wraps. */
export function openProfileChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -SOURCE_ENDPOINT_TOLERANCE_METERS || s > courseLength + SOURCE_ENDPOINT_TOLERANCE_METERS) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= SOURCE_ENDPOINT_TOLERANCE_METERS) return 0;
  if (Math.abs(s - courseLength) <= SOURCE_ENDPOINT_TOLERANCE_METERS) return courseLength;
  return s;
}
