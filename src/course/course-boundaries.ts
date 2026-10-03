import type { CompiledCoursePosition } from './course-geometry.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly vertices: readonly { readonly at: CompiledCoursePosition; readonly l: number }[];
}

export interface CompiledCarriageway {
  readonly id: string;
  readonly left: CompiledBoundary;
  readonly right: CompiledBoundary;
  /** Lanes dividing the road between its Boundaries equally; lane 0 is the leftmost. */
  readonly lanes: number;
}

/** Canonical resolved vertices are the authority; neither widths nor centers are independently stored. */
export function courseBoundaryAt(boundary: CompiledBoundary, s: number): number {
  const vertices = boundary.vertices;
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

/** The centre of lane `lane` (0 is the leftmost) at Section station `s`: `left + (lane + 0.5) / lanes × (right − left)`. */
export function courseLaneCenterAt(road: CompiledCarriageway, lane: number, s: number): number {
  const left = courseBoundaryAt(road.left, s);
  return left + ((lane + 0.5) / road.lanes) * (courseBoundaryAt(road.right, s) - left);
}

/**
 * The lane whose centre lies nearest Section lateral `l` at station `s`, within the road's lanes; an exact tie goes to
 * the right, as the half-open lateral rule assigns ties.
 */
export function courseLaneAt(road: CompiledCarriageway, l: number, s: number): number {
  const left = courseBoundaryAt(road.left, s),
    width = courseBoundaryAt(road.right, s) - left;
  const lane = width > 0 ? Math.floor(((l - left) / width) * road.lanes) : 0;
  return Math.min(road.lanes - 1, Math.max(0, lane));
}

/** Existence follows the common Boundary domain, half-open except at the Section terminal. */
export function courseCarriagewayExists(road: CompiledCarriageway, s: number, sectionLength: number): boolean {
  const start = Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s);
  const end = Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s);
  return s >= start && (s < end || (s === end && end === sectionLength));
}
