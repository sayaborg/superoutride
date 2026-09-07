const ENDPOINT_TOLERANCE = 1e-9;

/** Source-profile endpoint normalization; length is validated by the owning source constructor.
 * Not the strict SurfaceMap domain or the distinct Raster/Guide sampling tolerance. Never wraps. */
export function openProfileChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -ENDPOINT_TOLERANCE || s > courseLength + ENDPOINT_TOLERANCE) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= ENDPOINT_TOLERANCE) return 0;
  if (Math.abs(s - courseLength) <= ENDPOINT_TOLERANCE) return courseLength;
  return s;
}
