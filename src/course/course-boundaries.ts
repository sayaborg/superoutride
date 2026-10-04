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
// The index of the Boundary edge holding station s, by searching resolved positions directly.
function boundaryEdgeAt(vertices: CompiledBoundary['vertices'], s: number): number {
  let low = 0,
    high = vertices.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (vertices[mid]!.at.s <= s) low = mid + 1;
    else high = mid;
  }
  return Math.min(Math.max(0, low - 1), vertices.length - 2);
}

/** The Boundary's lateral change per metre of station at s: its affine edge's slope (the following edge at a vertex). */
export function courseBoundarySlopeAt(boundary: CompiledBoundary, s: number): number {
  const vertices = boundary.vertices;
  const i = boundaryEdgeAt(vertices, s);
  return (vertices[i + 1]!.l - vertices[i]!.l) / (vertices[i + 1]!.at.s - vertices[i]!.at.s);
}

export function courseBoundaryAt(boundary: CompiledBoundary, s: number): number {
  const vertices = boundary.vertices;
  const i = boundaryEdgeAt(vertices, s);
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
 * The lane whose centre lies nearest Section lateral `l` at station `s`, within the road's lanes; an equal distance, on
 * the line between two lanes, goes to the lower-numbered lane, as every nearest-lane choice does.
 */
export function courseLaneAt(road: CompiledCarriageway, l: number, s: number): number {
  const left = courseBoundaryAt(road.left, s),
    width = courseBoundaryAt(road.right, s) - left;
  const lane = width > 0 ? Math.ceil(((l - left) / width) * road.lanes) - 1 : 0;
  return Math.min(road.lanes - 1, Math.max(0, lane));
}

/** Existence follows the common Boundary domain, half-open except at the Section terminal. */
export function courseCarriagewayExists(road: CompiledCarriageway, s: number, sectionLength: number): boolean {
  const start = Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s);
  const end = Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s);
  return s >= start && (s < end || (s === end && end === sectionLength));
}
