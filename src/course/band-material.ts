import { bandEdgeAt, bandSlabAt, bandSpanAt, resolveBandSlabs, type BandPiece, type BandSlab } from './band-ground.js';
import { SURFACE_MATERIALS, type SurfaceMaterial } from './surface-material.js';

const samples = new Map(
  Object.values(SURFACE_MATERIALS).map((material) => [
    material,
    Object.freeze({ sectionName: material.type, type: material.type, material }),
  ]),
);
export const VOID_SURFACE = samples.get(SURFACE_MATERIALS.VOID)!;

export interface BandMaterial {
  readonly length: number;
  readonly slabs: readonly BandSlab<SurfaceMaterial | null>[];
  sample(s: number, l: number): typeof VOID_SURFACE;
  sampleInChart(s: number, l: number, lateralOrigin: number): typeof VOID_SURFACE;
}

/** The same resolved cross-section shape as color; all point reads borrow immutable samples. */
export function compileBandMaterial(
  length: number,
  pieces: readonly BandPiece<SurfaceMaterial | null>[],
): BandMaterial {
  const slabs = resolveBandSlabs(length, pieces, null);
  const sampleInChart = (s: number, l: number, lateralOrigin: number) => {
    if (typeof s !== 'number' || typeof l !== 'number' || typeof lateralOrigin !== 'number')
      throw new TypeError('Material coordinates and origin must be numeric');
    if (!Number.isFinite(s) || !Number.isFinite(l) || !Number.isFinite(lateralOrigin) || s < 0 || s > length)
      throw new RangeError('Material query must be finite and inside the Section');
    const material = bandSpanAt(slabs[bandSlabAt(slabs, s)]!, s, l, lateralOrigin).color;
    return material === null ? VOID_SURFACE : samples.get(material)!;
  };
  return Object.freeze({ length, slabs, sample: (s: number, l: number) => sampleInChart(s, l, 0), sampleInChart });
}

/** Compiler-only support intervals; runtime point reads never construct interval arrays. */
export function bandSupportedIntervals(slab: BandSlab<SurfaceMaterial | null>, s: number): [number, number][] {
  const result: [number, number][] = [];
  for (const span of slab.spans) {
    if (!span.color?.supported) continue;
    const left = bandEdgeAt(span, 'left', s),
      right = bandEdgeAt(span, 'right', s);
    if (right <= left) continue;
    const previous = result.at(-1);
    if (previous && previous[1] === left) previous[1] = right;
    else result.push([left, right]);
  }
  return result;
}

export function bandSupportsInterval(field: BandMaterial, s: number, left: number, right: number): boolean {
  return (
    right > left &&
    bandSupportedIntervals(field.slabs[bandSlabAt(field.slabs, s)]!, s).some(([a, b]) => a <= left && b >= right)
  );
}
