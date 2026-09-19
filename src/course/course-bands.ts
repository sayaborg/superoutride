import type { BandDocument } from './course-document.js';
import type { CompiledCourseAnchor } from './course-geometry.js';

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

/** Half-open lateral ownership. Outside/gaps return null; roles do not infer physical or visual bindings. */
export function courseBandAt(bands: readonly CompiledBand[], s: number, l: number): CompiledBand | null {
  if (!Number.isFinite(l)) throw new RangeError('Band lateral query must be finite');
  if (bands.length === 0) throw new RangeError('Band reader requires a nonempty compiled partition');
  if (!Number.isFinite(s) || s < bands[0]!.start.s || s > bands[0]!.end.s)
    throw new RangeError('Band query must be within its finite Section domain');
  for (const band of bands) if (l >= courseBoundaryAt(band.left, s) && l < courseBoundaryAt(band.right, s)) return band;
  return null;
}
