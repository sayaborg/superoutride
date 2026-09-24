import { Profile, ProfilePolyline } from '../geometry/profile.js';
import type { SectionDocument, CourseAnchor } from '../course-document.js';
import type { CompiledCourseAnchor } from '../course-geometry.js';
import type { CompiledRegion } from '../course-regions.js';
import type { CompiledPhysicalBinding } from '../course-physical-binding.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { SURFACE_MATERIALS, type SurfaceMaterial, type SurfaceType } from '../surface-material.js';

export const COURSE_PHYSICAL_RECIPE = Object.freeze({
  id: 'superoutride.course-physical',
  version: 2,
  materials: SURFACE_MATERIALS,
});

/** Static compilation resolves authored physics once; no default height or role-derived material. */
export function compileCoursePhysicalContent(
  source: SectionDocument,
  length: number,
  regions: readonly CompiledRegion[],
  resolve: (anchor: CourseAnchor, path: string) => CompiledCourseAnchor,
  path: string,
) {
  const heightPath = `${path}/height`;
  const nodes = source.height.map((node, i) => ({
    s: resolve(node.anchor, `${heightPath}/${i}/anchor`).s,
    y: node.y,
    curveLength: node.curveLength,
  }));
  requireCourse(nodes.length >= 2, heightPath, 'Height requires at least two nodes', 'invalid_height');
  requireCourse(
    nodes[0]!.s === 0 && nodes.at(-1)!.s === length,
    heightPath,
    'Height must cover [0, Section length]',
    'invalid_height',
  );
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    requireCourse(
      b.s > a.s && Number.isFinite((b.y - a.y) / (b.s - a.s)),
      `${heightPath}/${i}`,
      'Height nodes must increase with finite grade',
      'invalid_height',
    );
  }
  for (let i = 0; i < nodes.length; i++) {
    requireCourse(
      nodes[i]!.curveLength >= 0,
      `${heightPath}/${i}/curveLength`,
      'Curve length must be nonnegative',
      'invalid_height',
    );
    if (i === 0 || i === nodes.length - 1)
      requireCourse(
        nodes[i]!.curveLength === 0,
        `${heightPath}/${i}/curveLength`,
        'Endpoint curve length must be zero',
        'invalid_height',
      );
    if (i > 0)
      requireCourse(
        nodes[i - 1]!.s + nodes[i - 1]!.curveLength / 2 <= nodes[i]!.s - nodes[i]!.curveLength / 2,
        `${heightPath}/${i}/curveLength`,
        'Adjacent vertical curves must not overlap',
        'invalid_height',
      );
  }
  const height = Object.freeze(new Profile(length, nodes));
  const renderHeight = Object.freeze(new ProfilePolyline(height));
  const table = new Map(regions.map((region) => [region.id, region]));
  const assigned = new Set<CompiledRegion>();
  const physicalBindings = source.physicalBindings.map((binding, i): CompiledPhysicalBinding<SurfaceMaterial> => {
    const at = `${path}/physicalBindings/${i}`,
      region = table.get(binding.regionId);
    if (!region)
      throw new CourseInputError('unresolved_reference', `${at}/regionId`, 'Unknown physical Region reference');
    requireCourse(
      !assigned.has(region),
      `${at}/regionId`,
      'Each Region needs exactly one physical binding',
      'physical_binding',
    );
    assigned.add(region);
    requireCourse(
      binding.sections.length > 0,
      `${at}/sections`,
      'Physical binding requires an explicit material profile',
      'invalid_profile',
    );
    const sections = binding.sections.map((section, j) => {
      const nodePath = `${at}/sections/${j}`;
      if (!Object.hasOwn(SURFACE_MATERIALS, section.material))
        throw new CourseInputError('unresolved_reference', `${nodePath}/material`, 'Unknown physical material');
      const anchor = resolve(section.anchor, `${nodePath}/anchor`);
      requireCourse(
        anchor.s >= region.start.s && anchor.s < region.end.s,
        `${nodePath}/anchor`,
        'Material change must lie inside the active Region',
        'invalid_profile',
      );
      return Object.freeze({ anchor, material: SURFACE_MATERIALS[section.material as SurfaceType] });
    });
    requireCourse(
      sections[0]!.anchor.s === region.start.s,
      `${at}/sections/0/anchor`,
      'Material profile must begin at Region activation',
      'invalid_profile',
    );
    for (let j = 1; j < sections.length; j += 1)
      requireCourse(
        sections[j]!.anchor.s > sections[j - 1]!.anchor.s,
        `${at}/sections/${j}/anchor`,
        'Material changes must be strictly increasing',
        'invalid_profile',
      );
    return Object.freeze({ region, sections: Object.freeze(sections) });
  });
  requireCourse(
    assigned.size === regions.length,
    `${path}/physicalBindings`,
    'Every Region requires an explicit physical binding',
    'physical_binding',
  );
  return Object.freeze({ height, renderHeight, physicalBindings: Object.freeze(physicalBindings) });
}
