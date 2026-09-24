import type { CompiledRegion } from './course-regions.js';
import type { CompiledCoursePosition } from './course-geometry.js';

/** Geometry owns references and intervals; the composing domain owns material semantics. */
export interface CompiledPhysicalBinding<Material> {
  readonly region: CompiledRegion;
  readonly sections: readonly { readonly at: CompiledCoursePosition; readonly material: Material }[];
}

/** Trusted compiled profile: start-inclusive changes, extending to the Region's end. */
export function coursePhysicalMaterialAt<Material>(binding: CompiledPhysicalBinding<Material>, s: number): Material {
  let index = 0;
  for (let i = 1; i < binding.sections.length && binding.sections[i]!.at.s <= s; i += 1) index = i;
  return binding.sections[index]!.material;
}
