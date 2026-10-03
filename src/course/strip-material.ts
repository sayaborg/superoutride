import {
  stripEdgeAt,
  stripSlabAt,
  stripSpanAt,
  resolveStripSlabs,
  type StripPiece,
  type StripSlab,
} from './strip-slabs.js';
import type { SurfaceMaterial } from './surface-material.js';
import { requireCourse } from './course-diagnostics.js';

export interface StripMaterial {
  readonly length: number;
  readonly slabs: readonly StripSlab<SurfaceMaterial | null>[];
  sample(s: number, l: number): SurfaceMaterial | null;
  sampleInChart(s: number, l: number, lateralOrigin: number): SurfaceMaterial | null;
}

/** The same resolved cross-section shape as color; point reads return the admitted material or null. */
export function compileStripMaterial(
  length: number,
  pieces: readonly StripPiece<SurfaceMaterial | null>[],
  path: string,
): StripMaterial {
  const slabs = resolveStripSlabs(length, pieces, null, path);
  const sampleInChart = (s: number, l: number, lateralOrigin: number) =>
    stripSpanAt(slabs[stripSlabAt(slabs, s)]!, s, l, lateralOrigin).value;
  return Object.freeze({ length, slabs, sample: (s: number, l: number) => sampleInChart(s, l, 0), sampleInChart });
}

/** Compiler-only support intervals; runtime point reads never construct interval arrays. */
export function stripSupportedIntervals(slab: StripSlab<SurfaceMaterial | null>, s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const span of slab.spans) {
    if (span.value === null) continue;
    const left = stripEdgeAt(span, 'left', s),
      right = stripEdgeAt(span, 'right', s);
    if (right <= left) continue;
    const previous = result.at(-1);
    if (previous && previous[1] === left) previous[1] = right;
    else result.push([left, right]);
  }
  return result;
}

export function stripSupportsInterval(field: StripMaterial, s: number, left: number, right: number): boolean {
  return (
    right > left &&
    stripSupportedIntervals(field.slabs[stripSlabAt(field.slabs, s)]!, s).some(([a, b]) => a <= left && b >= right)
  );
}

/** The union of material-bearing cells has matching limits at every slab transition. */
export function validateMaterialContinuity(material: StripMaterial, path: string): void {
  const union = (slab: StripMaterial['slabs'][number], s: number) => {
    const result: [number, number][] = [];
    for (const span of slab.spans) {
      if (span.value === null) continue;
      const left = stripEdgeAt(span, 'left', s),
        right = stripEdgeAt(span, 'right', s);
      if (left === right) continue;
      const previous = result.at(-1);
      if (previous && previous[1] >= left) previous[1] = Math.max(previous[1], right);
      else result.push([left, right]);
    }
    return result;
  };
  for (let i = 1; i < material.slabs.length; i++) {
    const s = material.slabs[i]!.start;
    const before = union(material.slabs[i - 1]!, s),
      after = union(material.slabs[i]!, s);
    requireCourse(
      before.length === after.length && before.every((r, j) => r[0] === after[j]![0] && r[1] === after[j]![1]),
      path,
      `Material union must be continuous at s=${s}`,
      'material_transition_discontinuity',
    );
  }
}
