/** Absolute source-domain endpoint tolerance in metres; never a topology/wrapping rule. */
export const DOMAIN_TOLERANCE = 1e-9;

/** Source-profile endpoint normalization; length is validated by the owning source constructor.
 * Raster/Guide sampling has a separate geometric tolerance. Never wraps. */
export function openProfileChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -DOMAIN_TOLERANCE || s > courseLength + DOMAIN_TOLERANCE) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= DOMAIN_TOLERANCE) return 0;
  if (Math.abs(s - courseLength) <= DOMAIN_TOLERANCE) return courseLength;
  return s;
}
