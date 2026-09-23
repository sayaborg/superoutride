import { courseRegionAt, type CompiledRegionPartition } from './course-regions.js';
import { coursePhysicalMaterialAt, type CompiledPhysicalBinding } from './course-physical-binding.js';
import { SURFACE_MATERIALS, type SurfaceMaterial } from './surface-material.js';

/** Adapter over admitted ordinary facets. No course graph, ID join, role inference or copied geometry. */
export function createRegionSurfaceReader(
  partition: CompiledRegionPartition,
  bindings: readonly CompiledPhysicalBinding<SurfaceMaterial>[],
) {
  const table = new Map(bindings.map((binding) => [binding.region, binding]));
  if (
    table.size !== bindings.length ||
    table.size !== partition.regions.length ||
    partition.regions.some((region) => !table.has(region))
  )
    throw new RangeError('Physical bindings must cover exactly the canonical partition Regions');
  const samples = new Map(
    bindings.map((binding) => [
      binding.region,
      new Map(
        binding.sections.map((node) => [
          node.material,
          Object.freeze({ sectionName: binding.region.id, type: node.material.type, material: node.material }),
        ]),
      ),
    ]),
  );
  const outside = Object.freeze({
    sectionName: 'OUTSIDE',
    type: SURFACE_MATERIALS.VOID.type,
    material: SURFACE_MATERIALS.VOID,
  });
  const sampleInChart = (s: number, l: number, sourceLateralOrigin: number) => {
    if (typeof s !== 'number' || typeof l !== 'number') throw new TypeError('Surface coordinates must be numeric');
    const region = courseRegionAt(partition, s, l, sourceLateralOrigin);
    const material = region ? coursePhysicalMaterialAt(table.get(region)!, s) : SURFACE_MATERIALS.VOID;
    return region ? samples.get(region)!.get(material)! : outside;
  };
  return Object.freeze({
    sample: (s: number, l: number) => sampleInChart(s, l, 0),
    /** Compare shifted boundaries directly; never add the origin back before ownership classification. */
    sampleInChart,
  });
}
