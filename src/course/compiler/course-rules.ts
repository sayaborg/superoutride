import type { CourseDocument, CourseLandmarkDocument } from '../course-document.js';
import { requireCourse } from '../course-diagnostics.js';
import { resolveCourseAnchor, type CompiledCourseAnchor } from '../course-geometry.js';
import { courseBoundaryAt, type CompiledCarriageway } from '../course-regions.js';
import { coursePhysicalMaterialAt } from '../course-physical-binding.js';
import { createRegionSurfaceReader } from '../region-surface-reader.js';
import type { CompiledSection } from './course-graph.js';

export interface CompiledCourseLandmark {
  readonly id: string;
  readonly section: CompiledSection;
  readonly carriageway: CompiledCarriageway;
  readonly anchor: CompiledCourseAnchor;
  readonly left: number;
  readonly right: number;
}

/** Canonical references and ordinary geometry; no live race, driver or vehicle catalog dependency. */
export function compileCourseRules(
  document: CourseDocument,
  sections: readonly CompiledSection[],
  entry: CompiledSection,
) {
  const source = document.rules;
  if (source === null) return null;
  const check = (condition: boolean, path: string, message: string) =>
    requireCourse(condition, path, message, 'invalid_rules');
  const tables = new Map(
    sections.map((section) => [section, new Map(section.primitives.map((p) => [p.source.id, p]))]),
  );
  const resolve = (section: CompiledSection, anchor: CourseLandmarkDocument['anchor'], path: string) =>
    resolveCourseAnchor(anchor, tables.get(section)!, section.coordinates.domain.end, path);
  const endS = (section: CompiledSection) => section.coordinates.domain.end;
  const compile = (g: CourseLandmarkDocument, path: string): CompiledCourseLandmark => {
    const section = sections.find((s) => s.id === g.sectionId);
    requireCourse(section !== undefined, path + '/sectionId', 'Unknown landmark Section', 'unresolved_reference');
    const carriageway = section.carriageways.find((c) => c.id === g.carriagewayId);
    requireCourse(
      carriageway !== undefined,
      path + '/carriagewayId',
      'Unknown landmark Carriageway',
      'unresolved_reference',
    );
    const anchor = resolve(section, g.anchor, path + '/anchor');
    check(
      anchor.s > 0 && anchor.s <= endS(section),
      path,
      'Landmark must lie after entry and no later than its ownership exit',
    );
    const regions = carriageway.regions.filter((b) => b.start.s <= anchor.s && anchor.s <= b.end.s);
    check(regions.length > 0, path, 'Landmark requires pavement');
    const left = Math.min(...regions.map((b) => courseBoundaryAt(b.left, anchor.s)));
    const right = Math.max(...regions.map((b) => courseBoundaryAt(b.right, anchor.s)));
    check(
      right > left &&
        regions.every(
          (b) =>
            coursePhysicalMaterialAt(
              section.physicalBindings.find((p) => p.region === b)!,
              anchor.s,
            ).supported,
        ),
      path,
      'Landmark requires positive supported width',
    );
    return Object.freeze({ id: g.id, section, carriageway, anchor, left, right });
  };
  const checkpoints = source.checkpoints.map((g, i) => compile(g, `/rules/checkpoints/${i}`));
  const finishes = source.finishes.map((g, i) => compile(g, `/rules/finishes/${i}`));
  check(
    new Set([...checkpoints, ...finishes].map((g) => g.id)).size === checkpoints.length + finishes.length,
    '/rules',
    'Landmark IDs must be unique',
  );
  check(document.type === 'CIRCUIT' || source.maxLaps === 1, '/rules/maxLaps', 'Only CIRCUIT has repeated laps');
  check(source.classic.lapCount <= source.maxLaps, '/rules/classic/lapCount', 'Preset laps exceed course limit');
  const intervals = sections.map((section) => {
    const gates = checkpoints.filter((g) => g.section === section);
    const goals = finishes.filter((g) => g.section === section);
    const terminal = section.outgoing.length === 0 || document.type === 'CIRCUIT';
    check(
      goals.length === Number(terminal),
      '/rules/finishes',
      'Each terminal or circuit Section needs exactly one FINISH; continuation Sections have none',
    );
    const finish = goals[0] ?? null;
    if (document.type === 'CIRCUIT')
      check(finish!.anchor.s === endS(section), '/rules/finishes', 'Circuit FINISH must coincide with its loop exit');
    let previous = 0;
    for (const gate of gates) {
      check(
        gate.anchor.s > previous && gate.anchor.s < (finish?.anchor.s ?? endS(section)),
        '/rules/checkpoints',
        'Checkpoints must be strictly ordered inside their Section interval',
      );
      previous = gate.anchor.s;
    }
    return Object.freeze({ section, checkpoints: Object.freeze(gates), finish });
  });
  const surface = createRegionSurfaceReader(entry.regionPartition, entry.physicalBindings);
  check(
    source.grid.length > source.classic.rivalCount,
    '/rules/grid',
    'Grid must contain the player and preset rivals',
  );
  const first = intervals.find((i) => i.section === entry)!;
  const firstGate = first.checkpoints[0]?.anchor.s ?? first.finish?.anchor.s ?? endS(entry);
  const grid = source.grid.map((slot, i) => {
    const anchor = resolve(entry, slot.anchor, `/rules/grid/${i}/anchor`);
    check(anchor.s >= 0 && anchor.s < firstGate, `/rules/grid/${i}`, 'Grid must lie between entry and the first gate');
    check(surface.sample(anchor.s, slot.l).material.supported, `/rules/grid/${i}`, 'Grid must be supported');
    return Object.freeze({ anchor, l: slot.l });
  });
  return Object.freeze({
    grid: Object.freeze(grid),
    intervals: Object.freeze(intervals),
    maxLaps: source.maxLaps,
    classic: source.classic,
  });
}
