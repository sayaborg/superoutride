import type { compileCourseTopology } from './course-links.js';
import { resolveCourseLateral } from './course-lateral.js';
import type { CourseDocument, CourseLandmarkDocument } from '../course-document.js';
import { requireCourse } from '../course-diagnostics.js';
import { resolveCoursePosition, type CompiledCoursePosition } from '../course-geometry.js';
import { courseBoundaryAt, courseCarriagewayExists, type CompiledCarriageway } from '../course-boundaries.js';
import { stripSupportsInterval } from '../strip-material.js';
import type { CompiledSection } from './course-graph.js';

export interface CompiledCourseLandmark {
  readonly id: string;
  readonly section: CompiledSection;
  readonly carriageway: CompiledCarriageway;
  readonly at: CompiledCoursePosition;
  readonly left: number;
  readonly right: number;
}

/** Canonical references and ordinary geometry; no live race, driver or vehicle catalog dependency. */
export function compileCourseGates(
  document: CourseDocument,
  type: ReturnType<typeof compileCourseTopology>,
  sections: readonly CompiledSection[],
  entry: CompiledSection,
  stations: ReadonlyMap<CompiledSection, ReadonlyMap<string, number>>,
) {
  const source = document.rules;
  const check = (condition: boolean, path: string, message: string) =>
    requireCourse(condition, path, message, 'invalid_gate');
  const authored = document.sections.flatMap((source, i) =>
    source.gates.map((gate, j) => ({ gate, section: sections[i]!, path: `/sections/${i}/gates/${j}` })),
  );
  const starts = authored.filter(
    (item): item is typeof item & { gate: Extract<typeof item.gate, { kind: 'start' }> } => item.gate.kind === 'start',
  );
  if (source === null) {
    const raceGate = authored.find(
      ({ gate }) => gate.kind === 'start' || gate.kind === 'checkpoint' || gate.kind === 'finish',
    );
    check(
      !raceGate,
      raceGate?.path ?? '/rules',
      'A draft without race settings cannot contain start, checkpoint or finish gates',
    );
    return null;
  }
  check(
    starts.length === 1 && starts[0]!.section === entry,
    starts[0]?.path ?? `/sections/${sections.indexOf(entry)}/gates`,
    'Exactly one start gate must belong to the entry Section',
  );
  const start = starts[0]!;
  const startGate = start.gate;

  const resolve = (section: CompiledSection, position: CourseLandmarkDocument['at'], path: string) =>
    resolveCoursePosition(position, stations.get(section)!, section.coordinates.domain.end, path);
  const endS = (section: CompiledSection) => section.coordinates.domain.end;
  const compile = (g: CourseLandmarkDocument, section: CompiledSection, path: string): CompiledCourseLandmark => {
    const carriageway = section.carriageways.find((c) => c.id === g.carriageway);
    requireCourse(
      carriageway !== undefined,
      path + '/carriageway',
      'Unknown landmark Carriageway',
      'unresolved_reference',
    );
    const position = resolve(section, g.at, path + '/at');
    check(
      position.s > 0 && position.s <= endS(section),
      path,
      'Landmark must lie after entry and no later than its ownership exit',
    );
    check(courseCarriagewayExists(carriageway, position.s, endS(section)), path, 'Landmark requires a Carriageway');
    const left = courseBoundaryAt(carriageway.left, position.s);
    const right = courseBoundaryAt(carriageway.right, position.s);
    check(
      stripSupportsInterval(section.material, position.s, left, right),
      path,
      'Landmark requires positive supported width',
    );
    return Object.freeze({ id: g.id, section, carriageway, at: position, left, right });
  };
  const landmarks = authored.flatMap(({ gate, section, path }) =>
    gate.kind === 'checkpoint' || gate.kind === 'finish'
      ? [{ kind: gate.kind, value: compile(gate, section, path), path }]
      : [],
  );
  const checkpoints = landmarks.filter((g) => g.kind === 'checkpoint').map((g) => g.value);
  const finishes = landmarks.filter((g) => g.kind === 'finish').map((g) => g.value);
  requireCourse(
    type === 'CIRCUIT' || source.maxLaps === 1,
    '/rules/maxLaps',
    'Only CIRCUIT has repeated laps',
    'invalid_rules',
  );
  requireCourse(
    source.classic.lapCount <= source.maxLaps,
    '/rules/classic/lapCount',
    'Preset laps exceed course limit',
    'invalid_rules',
  );
  const gatePath = (value: CompiledCourseLandmark) => landmarks.find((g) => g.value === value)!.path;
  const intervals = sections.map((section, index) => {
    const path = `/sections/${index}/gates`;
    const gates = checkpoints.filter((g) => g.section === section);
    const goals = finishes.filter((g) => g.section === section);
    const terminal = type === 'CIRCUIT' ? section.outgoing[0]!.to.section === entry : section.outgoing.length === 0;
    check(
      goals.length === Number(terminal),
      goals[0] ? gatePath(goals.at(-1)!) : path,
      'Each terminal or circuit return-to-entry Section needs exactly one FINISH; other Sections have none',
    );
    const finish = goals[0] ?? null;
    if (type === 'CIRCUIT' && finish)
      check(finish.at.s === endS(section), gatePath(finish), 'Circuit FINISH must coincide with its loop exit');
    let previous = 0;
    for (const gate of gates) {
      check(
        gate.at.s > previous && (finish ? gate.at.s < finish.at.s : gate.at.s <= endS(section)),
        gatePath(gate),
        'Checkpoints must be strictly ordered inside their Section interval',
      );
      previous = gate.at.s;
    }
    return Object.freeze({ section, checkpoints: Object.freeze(gates), finish });
  });
  const surface = entry.material;
  check(
    startGate.grid.length > source.classic.rivalCount,
    `${start.path}/grid`,
    'Grid must contain the player and preset rivals',
  );
  const first = intervals.find((i) => i.section === entry)!;
  const firstGate = Math.min(
    first.checkpoints[0]?.at.s ?? first.finish?.at.s ?? endS(entry),
    entry.fork?.lock.s ?? Infinity,
  );
  const boundaries = new Map(entry.boundaries.map((boundary) => [boundary.id, boundary]));
  const grid = startGate.grid.map((slot, i) => {
    const position = resolve(entry, slot.at, `${start.path}/grid/${i}/at`);
    check(
      position.s >= 0 && position.s < firstGate,
      `${start.path}/grid/${i}`,
      'Grid must lie between entry and the first gate',
    );
    const l = resolveCourseLateral(slot.lateral, position.s, boundaries, `${start.path}/grid/${i}/lateral`);
    check(surface.sample(position.s, l).material.supported, `${start.path}/grid/${i}`, 'Grid must be supported');
    return Object.freeze({ at: position, l });
  });
  return Object.freeze({
    grid: Object.freeze(grid),
    intervals: Object.freeze(intervals),
  });
}
