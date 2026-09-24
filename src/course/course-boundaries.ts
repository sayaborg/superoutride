import type { CompiledCoursePosition } from './course-geometry.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly vertices: readonly { readonly at: CompiledCoursePosition; readonly l: number }[];
}

export interface CompiledCarriageway {
  readonly id: string;
  readonly left: CompiledBoundary;
  readonly right: CompiledBoundary;
}

/** Canonical resolved vertices are the authority; neither widths nor centers are independently stored. */
export function courseBoundaryAt(boundary: CompiledBoundary, s: number): number {
  const vertices = boundary.vertices;
  if (!Number.isFinite(s) || s < vertices[0]!.at.s || s > vertices.at(-1)!.at.s)
    throw new RangeError('Boundary query must be within its finite vertex domain');
  // Search resolved positions directly without building another station table.
  let low = 0,
    high = vertices.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (vertices[mid]!.at.s <= s) low = mid + 1;
    else high = mid;
  }
  const i = Math.min(Math.max(0, low - 1), vertices.length - 2);
  const a = vertices[i]!,
    b = vertices[i + 1]!;
  if (s === a.at.s) return a.l;
  if (s === b.at.s) return b.l;
  return a.l + (b.l - a.l) * ((s - a.at.s) / (b.at.s - a.at.s));
}

/** Existence follows the common Boundary domain, half-open except at the Section terminal. */
export function courseCarriagewayExists(road: CompiledCarriageway, s: number, sectionLength: number): boolean {
  const start = Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s);
  const end = Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s);
  return s >= start && (s < end || (s === end && end === sectionLength));
}
