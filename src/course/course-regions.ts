import type { CompiledCoursePosition } from './course-geometry.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly knots: readonly { readonly at: CompiledCoursePosition; readonly l: number }[];
}

export interface CompiledCarriageway {
  readonly id: string;
  readonly left: CompiledBoundary;
  readonly right: CompiledBoundary;
}

/** Canonical resolved knots are the authority; neither widths nor centers are independently stored. */
export function courseBoundaryAt(boundary: CompiledBoundary, s: number): number {
  const knots = boundary.knots;
  if (!Number.isFinite(s) || s < knots[0]!.at.s || s > knots.at(-1)!.at.s)
    throw new RangeError('Boundary query must be within its finite knot domain');
  // Search resolved positions directly without building another station table.
  let low = 0,
    high = knots.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (knots[mid]!.at.s <= s) low = mid + 1;
    else high = mid;
  }
  const i = Math.min(Math.max(0, low - 1), knots.length - 2);
  const a = knots[i]!,
    b = knots[i + 1]!;
  if (s === a.at.s) return a.l;
  if (s === b.at.s) return b.l;
  return a.l + (b.l - a.l) * ((s - a.at.s) / (b.at.s - a.at.s));
}

/** Existence follows the common Boundary domain, half-open except at the Section terminal. */
export function courseCarriagewayExists(road: CompiledCarriageway, s: number, sectionLength: number): boolean {
  const start = Math.max(road.left.knots[0]!.at.s, road.right.knots[0]!.at.s);
  const end = Math.min(road.left.knots.at(-1)!.at.s, road.right.knots.at(-1)!.at.s);
  return s >= start && (s < end || (s === end && end === sectionLength));
}
