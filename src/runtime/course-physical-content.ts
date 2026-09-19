import { HeightProfile } from '../core/height-profile.js';
import type { SectionDocument, CourseAnchor } from '../course/course-document.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import type { CompiledBand } from '../course/course-bands.js';
import type { CompiledPhysicalBinding } from '../course/course-physical-binding.js';
import { CourseInputError } from '../course/course-diagnostics.js';
import { SURFACE_MATERIALS, type SurfaceMaterial, type SurfaceType } from '../physics/surface-map.js';

export const COURSE_PHYSICAL_RECIPE = Object.freeze({
  id: 'superoutride.course-physical',
  version: 1,
  height: 'Core HeightProfile: linear render; cosine-smooth physics/camera',
  materials: SURFACE_MATERIALS,
  ownership: 'Band half-open membership; start-inclusive material changes; outside VOID',
  overlap:
    'horizontal full height segments; all-Band material/support field; exact stations and linear cell endpoints; carriageway-Link position tolerance',
});

function requireContent(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new CourseInputError('semantic_compile_failure', path, message);
}

/** Resolve authored physics once; no default height, role-derived material or independent geometry. */
export function compileCoursePhysicalContent(
  source: SectionDocument,
  length: number,
  bands: readonly CompiledBand[],
  resolve: (anchor: CourseAnchor, path: string) => CompiledCourseAnchor,
  path: string,
) {
  const heightPath = `${path}/height`;
  const nodes = source.height.map((node, i) => ({ s: resolve(node.anchor, `${heightPath}/${i}/anchor`).s, y: node.y }));
  requireContent(nodes.length >= 2, heightPath, 'Height requires at least two nodes');
  requireContent(nodes[0]!.s === 0 && nodes.at(-1)!.s === length, heightPath, 'Height must cover [0, Section length]');
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    requireContent(
      b.s > a.s && Number.isFinite(Math.PI / (b.s - a.s)) && Number.isFinite(((b.y - a.y) * Math.PI) / (b.s - a.s)),
      `${heightPath}/${i}`,
      'Height nodes must increase with finite grade',
    );
  }
  const height = Object.freeze(new HeightProfile(length, nodes));
  const table = new Map(bands.map((band) => [band.id, band]));
  const assigned = new Set<CompiledBand>();
  const physicalBindings = source.physicalBindings.map((binding, i): CompiledPhysicalBinding<SurfaceMaterial> => {
    const at = `${path}/physicalBindings/${i}`,
      band = table.get(binding.bandId);
    if (!band) throw new CourseInputError('unresolved_reference', `${at}/bandId`, 'Unknown physical Band reference');
    requireContent(!assigned.has(band), `${at}/bandId`, 'Each Band needs exactly one physical binding');
    assigned.add(band);
    requireContent(
      binding.sections.length > 0,
      `${at}/sections`,
      'Physical binding requires an explicit material profile',
    );
    const sections = binding.sections.map((section, j) => {
      const nodePath = `${at}/sections/${j}`;
      if (!Object.hasOwn(SURFACE_MATERIALS, section.material))
        throw new CourseInputError('unresolved_reference', `${nodePath}/material`, 'Unknown physical material');
      const anchor = resolve(section.anchor, `${nodePath}/anchor`);
      requireContent(
        anchor.s >= band.start.s && anchor.s < band.end.s,
        `${nodePath}/anchor`,
        'Material change must lie inside the active Band',
      );
      return Object.freeze({ anchor, material: SURFACE_MATERIALS[section.material as SurfaceType] });
    });
    requireContent(
      sections[0]!.anchor.s === band.start.s,
      `${at}/sections/0/anchor`,
      'Material profile must begin at Band activation',
    );
    for (let j = 1; j < sections.length; j += 1)
      requireContent(
        sections[j]!.anchor.s > sections[j - 1]!.anchor.s,
        `${at}/sections/${j}/anchor`,
        'Material changes must be strictly increasing',
      );
    return Object.freeze({ band, sections: Object.freeze(sections) });
  });
  requireContent(
    assigned.size === bands.length,
    `${path}/physicalBindings`,
    'Every Band requires an explicit physical binding',
  );
  return Object.freeze({ height, physicalBindings: Object.freeze(physicalBindings) });
}
