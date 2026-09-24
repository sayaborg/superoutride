import { Profile, ProfilePolyline } from '../geometry/profile.js';
import type { SectionDocument, CoursePosition } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CompiledRegion } from '../course-regions.js';
import { compileBandMaterial } from '../band-material.js';
import { courseBoundaryAt, type CompiledBoundary } from '../course-regions.js';
import type { BandPiece, BandEdgeLine } from '../band-ground.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { SURFACE_MATERIALS, type SurfaceMaterial, type SurfaceType } from '../surface-material.js';

export const COURSE_PHYSICAL_RECIPE = Object.freeze({
  id: 'superoutride.course-physical',
  version: 3,
  materials: SURFACE_MATERIALS,
});

/** Static compilation resolves authored physics once; no default height or role-derived material. */
export function compileCoursePhysicalContent(
  source: SectionDocument,
  length: number,
  regions: readonly CompiledRegion[],
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
) {
  const heightPath = `${path}/height`;
  const nodes = source.height.map((node, i) => ({
    s: resolve(node.at, `${heightPath}/${i}/at`).s,
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
  const physicalBindings = source.physicalBindings.map((binding, i) => {
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
      const position = resolve(section.at, `${nodePath}/at`);
      requireCourse(
        position.s >= region.start.s && position.s < region.end.s,
        `${nodePath}/at`,
        'Material change must lie inside the active Region',
        'invalid_profile',
      );
      return Object.freeze({ at: position, material: SURFACE_MATERIALS[section.material as SurfaceType] });
    });
    requireCourse(
      sections[0]!.at.s === region.start.s,
      `${at}/sections/0/at`,
      'Material profile must begin at Region activation',
      'invalid_profile',
    );
    for (let j = 1; j < sections.length; j += 1)
      requireCourse(
        sections[j]!.at.s > sections[j - 1]!.at.s,
        `${at}/sections/${j}/at`,
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
  const pieces: BandPiece<SurfaceMaterial | null>[] = [];
  const line = (boundary: CompiledBoundary, s: number): BandEdgeLine => {
    const index = boundary.knots.findIndex((knot, i) => i > 0 && knot.at.s > s) - 1;
    const a = boundary.knots[index]!,
      b = boundary.knots[index + 1]!;
    return Object.freeze({ start: a.at.s, end: b.at.s, from: a.l, to: b.l });
  };
  for (const { region, sections } of physicalBindings) {
    const stations = [
      ...new Set([
        region.start.s,
        region.end.s,
        ...[region.left, region.right]
          .flatMap((boundary) => boundary.knots.map((k) => k.at.s))
          .filter((s) => s > region.start.s && s < region.end.s),
        ...sections.map((node) => node.at.s),
      ]),
    ].sort((a, b) => a - b);
    let materialIndex = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const start = stations[i]!,
        end = stations[i + 1]!;
      while (materialIndex + 1 < sections.length && sections[materialIndex + 1]!.at.s <= start) materialIndex++;
      pieces.push({
        start,
        end,
        left: courseBoundaryAt(region.left, start),
        right: courseBoundaryAt(region.right, start),
        leftEnd: courseBoundaryAt(region.left, end),
        rightEnd: courseBoundaryAt(region.right, end),
        leftLine: line(region.left, start + (end - start) / 2),
        rightLine: line(region.right, start + (end - start) / 2),
        color: sections[materialIndex]!.material,
      });
    }
  }
  let material;
  try {
    material = compileBandMaterial(length, pieces);
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError('invalid_profile', `${path}/physicalBindings`, error.message);
    throw error;
  }
  return Object.freeze({ height, renderHeight, material });
}
