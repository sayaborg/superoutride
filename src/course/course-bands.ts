import type { BandDocument } from './course-document.js';
import type { CompiledCourseAnchor } from './course-geometry.js';
import type { RasterPath } from '../core/raster-path.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly knots: readonly { readonly anchor: CompiledCourseAnchor; readonly l: number }[];
}

export interface CompiledBand {
  readonly id: string;
  readonly start: CompiledCourseAnchor;
  readonly end: CompiledCourseAnchor;
  readonly left: CompiledBoundary;
  readonly right: CompiledBoundary;
  readonly role: BandDocument['role'];
}

export interface CompiledCarriageway {
  readonly id: string;
  readonly bands: readonly CompiledBand[];
}

/** Narrow finite-domain facet; no Band is privileged as the Section's domain authority. */
export interface CompiledBandPartition {
  /** Canonical geometry against which the mapped Bands were admitted. */
  readonly raster: RasterPath;
  readonly length: number;
  readonly bands: readonly CompiledBand[];
}

/** Canonical resolved knots are the authority; neither widths nor centers are independently stored. */
export function courseBoundaryAt(boundary: CompiledBoundary, s: number): number {
  const knots = boundary.knots;
  if (!Number.isFinite(s) || s < knots[0]!.anchor.s || s > knots.at(-1)!.anchor.s)
    throw new RangeError('Boundary query must be within its finite knot domain');
  // Anchors retain primitive provenance. Search their resolved scalar without building another table.
  let low = 0,
    high = knots.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (knots[mid]!.anchor.s <= s) low = mid + 1;
    else high = mid;
  }
  const i = Math.min(Math.max(0, low - 1), knots.length - 2);
  const a = knots[i]!,
    b = knots[i + 1]!;
  if (s === a.anchor.s) return a.l;
  if (s === b.anchor.s) return b.l;
  return a.l + (b.l - a.l) * ((s - a.anchor.s) / (b.anchor.s - a.anchor.s));
}

/** Half-open ownership; l is in the chart whose zero is sourceLateralOrigin in source coordinates. */
export function courseBandAt(
  partition: CompiledBandPartition,
  s: number,
  l: number,
  sourceLateralOrigin = 0,
): CompiledBand | null {
  if (typeof sourceLateralOrigin !== 'number') throw new TypeError('Band lateral origin must be numeric');
  if (!Number.isFinite(l) || !Number.isFinite(sourceLateralOrigin))
    throw new RangeError('Band lateral query and origin must be finite');
  if (!Number.isFinite(s) || s < 0 || s > partition.length)
    throw new RangeError('Band query must be within its finite Section domain');
  for (let i = 0; i < partition.bands.length; i++) {
    const band = partition.bands[i]!;
    if (
      s >= band.start.s &&
      (s < band.end.s || (s === partition.length && s === band.end.s)) &&
      l >= courseBoundaryAt(band.left, s) - sourceLateralOrigin &&
      l < courseBoundaryAt(band.right, s) - sourceLateralOrigin
    )
      return band;
  }
  return null;
}
