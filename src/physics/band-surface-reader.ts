import { courseBandAt, courseBoundaryAt, type CompiledBandPartition } from '../course/course-bands.js';
import { coursePhysicalMaterialAt, type CompiledPhysicalBinding } from '../course/course-physical-binding.js';
import { SURFACE_MATERIALS, type SurfaceMaterial } from './surface-map.js';

/** Adapter over admitted ordinary facets. No course graph, ID join, role inference or copied geometry. */
export function createBandSurfaceReader(
  partition: CompiledBandPartition,
  bindings: readonly CompiledPhysicalBinding<SurfaceMaterial>[],
) {
  const table = new Map(bindings.map((binding) => [binding.band, binding]));
  if (
    table.size !== bindings.length ||
    table.size !== partition.bands.length ||
    partition.bands.some((band) => !table.has(band))
  )
    throw new RangeError('Physical bindings must cover exactly the canonical partition Bands');
  let maxSupportedAbsL = 0;
  for (const binding of bindings) {
    for (let i = 0; i < binding.sections.length; i += 1) {
      const node = binding.sections[i]!;
      if (!node.material.supported) continue;
      const start = node.anchor.s,
        end = binding.sections[i + 1]?.anchor.s ?? binding.band.end.s;
      for (const boundary of [binding.band.left, binding.band.right])
        for (const s of [start, end, ...boundary.knots.map((k) => k.anchor.s).filter((s) => s > start && s < end)])
          maxSupportedAbsL = Math.max(maxSupportedAbsL, Math.abs(courseBoundaryAt(boundary, s)));
    }
  }
  const sampleInChart = (s: number, l: number, sourceLateralOrigin: number) => {
    if (typeof s !== 'number' || typeof l !== 'number') throw new TypeError('Surface coordinates must be numeric');
    const band = courseBandAt(partition, s, l, sourceLateralOrigin);
    const material = band ? coursePhysicalMaterialAt(table.get(band)!, s) : SURFACE_MATERIALS.VOID;
    return { sectionName: band?.id ?? 'OUTSIDE', type: material.type, material };
  };
  return Object.freeze({
    maxSupportedAbsL,
    sample: (s: number, l: number) => sampleInChart(s, l, 0),
    /** Compare shifted boundaries directly; never add the origin back before ownership classification. */
    sampleInChart,
  });
}
