import type { CompiledBand } from './course-bands.js';
import type { CompiledCourseAnchor } from './course-geometry.js';

/** Geometry owns references and intervals; the composing domain owns material semantics. */
export interface CompiledPhysicalBinding<Material> {
  readonly band: CompiledBand;
  readonly sections: readonly { readonly anchor: CompiledCourseAnchor; readonly material: Material }[];
}

/** Trusted compiled profile: start-inclusive changes, extending to the Band's end. */
export function coursePhysicalMaterialAt<Material>(binding: CompiledPhysicalBinding<Material>, s: number): Material {
  let index = 0;
  for (let i = 1; i < binding.sections.length && binding.sections[i]!.anchor.s <= s; i += 1) index = i;
  return binding.sections[index]!.material;
}
