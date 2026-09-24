import {
  stripEdgeAt,
  stripSlabAt,
  stripSpanAt,
  resolveStripSlabs,
  type StripPiece,
  type StripSlab,
} from './strip-ground.js';
import { SURFACE_MATERIALS, type SurfaceMaterial } from './surface-material.js';

const samples = new Map(
  Object.values(SURFACE_MATERIALS).map((material) => [
    material,
    Object.freeze({ sectionName: material.type, type: material.type, material }),
  ]),
);
export const VOID_SURFACE = samples.get(SURFACE_MATERIALS.VOID)!;

export interface StripMaterial {
  readonly length: number;
  readonly slabs: readonly StripSlab<SurfaceMaterial | null>[];
  sample(s: number, l: number): typeof VOID_SURFACE;
  sampleInChart(s: number, l: number, lateralOrigin: number): typeof VOID_SURFACE;
}

/** The same resolved cross-section shape as color; all point reads borrow immutable samples. */
export function compileStripMaterial(
  length: number,
  pieces: readonly StripPiece<SurfaceMaterial | null>[],
): StripMaterial {
  const slabs = resolveStripSlabs(length, pieces, null);
  const sampleInChart = (s: number, l: number, lateralOrigin: number) => {
    if (typeof s !== 'number' || typeof l !== 'number' || typeof lateralOrigin !== 'number')
      throw new TypeError('Material coordinates and origin must be numeric');
    if (!Number.isFinite(s) || !Number.isFinite(l) || !Number.isFinite(lateralOrigin) || s < 0 || s > length)
      throw new RangeError('Material query must be finite and inside the Section');
    const material = stripSpanAt(slabs[stripSlabAt(slabs, s)]!, s, l, lateralOrigin).value;
    return material === null ? VOID_SURFACE : samples.get(material)!;
  };
  return Object.freeze({ length, slabs, sample: (s: number, l: number) => sampleInChart(s, l, 0), sampleInChart });
}

/** Compiler-only support intervals; runtime point reads never construct interval arrays. */
export function stripSupportedIntervals(slab: StripSlab<SurfaceMaterial | null>, s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const span of slab.spans) {
    if (!span.value?.supported) continue;
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
