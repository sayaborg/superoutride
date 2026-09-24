import type { RegionDocument } from './course-document.js';
import type { CompiledCourseAnchor } from './course-geometry.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly knots: readonly { readonly anchor: CompiledCourseAnchor; readonly l: number }[];
}

export interface CompiledRegion {
  readonly id: string;
  readonly start: CompiledCourseAnchor;
  readonly end: CompiledCourseAnchor;
  readonly left: CompiledBoundary;
  readonly right: CompiledBoundary;
  readonly role: RegionDocument['role'];
}

export interface CompiledCarriageway {
  readonly id: string;
  readonly regions: readonly CompiledRegion[];
}

/** Narrow finite-domain facet; no Region is privileged as the Section's domain authority. */
export interface CompiledRegionPartition {
  readonly length: number;
  readonly regions: readonly CompiledRegion[];
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
export function courseRegionAt(
  partition: CompiledRegionPartition,
  s: number,
  l: number,
  sourceLateralOrigin = 0,
): CompiledRegion | null {
  if (typeof sourceLateralOrigin !== 'number') throw new TypeError('Region lateral origin must be numeric');
  if (!Number.isFinite(l) || !Number.isFinite(sourceLateralOrigin))
    throw new RangeError('Region lateral query and origin must be finite');
  if (!Number.isFinite(s) || s < 0 || s > partition.length)
    throw new RangeError('Region query must be within its finite Section domain');
  for (let i = 0; i < partition.regions.length; i++) {
    const region = partition.regions[i]!;
    if (
      s >= region.start.s &&
      (s < region.end.s || (s === partition.length && s === region.end.s)) &&
      l >= courseBoundaryAt(region.left, s) - sourceLateralOrigin &&
      l < courseBoundaryAt(region.right, s) - sourceLateralOrigin
    )
      return region;
  }
  return null;
}
