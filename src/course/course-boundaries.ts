import type { CompiledCoursePosition } from './course-geometry.js';

export interface CompiledBoundary {
  readonly id: string;
  readonly vertices: readonly { readonly at: CompiledCoursePosition; readonly l: number }[];
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
