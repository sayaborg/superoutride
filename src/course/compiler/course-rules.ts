import type { compileCourseTopology } from './course-links.js';
import type { CourseDocument, CourseGridSlotDocument, CourseLandmarkDocument } from '../course-document.js';
import { requireCourse } from '../course-diagnostics.js';
import { resolveCoursePosition, type CompiledCoursePosition, type CourseJoints } from '../course-geometry.js';
import { courseBoundaryAt } from '../course-boundaries.js';
import { courseRoadsAt } from '../course-lanes.js';
import { stripSupportsInterval } from '../strip-material.js';
import { SESSION_RULE_LIMITS } from '../session-rules.js';
import type { CompiledSection } from './course-graph.js';

/** A grid slot: its Position in the entry Section and its lateral, the lane's centre there. */
export interface CompiledGridSlot {
  readonly at: CompiledCoursePosition;
  readonly l: number;
}

export interface CompiledCourseLandmark {
  readonly id: string;
  readonly section: CompiledSection;
  readonly at: CompiledCoursePosition;
}

/** Canonical references and ordinary geometry; no live race, driver or vehicle catalog dependency. */
export function compileCourseGates(
  document: CourseDocument,
  type: ReturnType<typeof compileCourseTopology>,
  sections: readonly CompiledSection[],
  entry: CompiledSection,
  joints: ReadonlyMap<CompiledSection, CourseJoints>,
) {
  const source = { maxLaps: document.maxLaps };
  const check = (condition: boolean, path: string, message: string) =>
    requireCourse(condition, path, message, 'invalid_gate');
  const authored = document.sections.flatMap((source, i) =>
    source.gates.map((gate, j) => ({ gate, section: sections[i]!, path: `/sections/${i}/gates/${j}` })),
  );
  const starts = authored.filter(
    (item): item is typeof item & { gate: Extract<typeof item.gate, { kind: 'start' }> } => item.gate.kind === 'start',
  );
  check(
    starts.length === 1 && starts[0]!.section === entry,
    starts[0]?.path ?? `/sections/${sections.indexOf(entry)}/gates`,
    'Exactly one start gate must belong to the entry Section',
  );
  const start = starts[0]!;
  const startGate = start.gate;

  const resolve = (section: CompiledSection, position: CourseLandmarkDocument['at'], path: string) =>
    resolveCoursePosition(position, joints.get(section)!, path);
  const endS = (section: CompiledSection) => section.coordinates.domain.end;
  const compile = (g: CourseLandmarkDocument, section: CompiledSection, path: string): CompiledCourseLandmark => {
    const position = resolve(section, g.at, path + '/at');
    check(
      position.s > 0 && position.s <= endS(section),
      path,
      'Landmark must lie after entry and no later than its ownership exit',
    );
    // The line spans the course; every lane there is supported.
    const roads = courseRoadsAt(section.lanes, position.s);
    check(
      roads.length > 0 &&
        roads.every((road) =>
          road.lanes.every((lane) =>
            stripSupportsInterval(
              section.material,
              position.s,
              courseBoundaryAt(lane.left, position.s),
              courseBoundaryAt(lane.right, position.s),
            ),
          ),
        ),
      path,
      'Landmark requires supported lanes',
    );
    return Object.freeze({ id: g.id, section, at: position });
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
    '/maxLaps',
    'Only CIRCUIT has repeated laps',
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
  const first = intervals.find((i) => i.section === entry)!;
  const firstGate = Math.min(
    first.checkpoints[0]?.at.s ?? first.finish?.at.s ?? endS(entry),
    entry.fork?.lock.s ?? Infinity,
  );
  // Grid order runs from the front of the grid to its back.
  const compileGrid = (slots: readonly CourseGridSlotDocument[], path: string) => {
    check(slots.length > 0, path, 'Grid must contain the player');
    let front = Infinity;
    return Object.freeze(
      slots.map((slot, i): CompiledGridSlot => {
        const position = resolve(entry, slot.at, `${path}/${i}/at`);
        check(
          position.s >= 0 && position.s < firstGate,
          `${path}/${i}`,
          'Grid must lie between entry and the first gate',
        );
        check(position.s <= front, `${path}/${i}`, 'Grid slots must be ordered from front to back');
        front = position.s;
        const lane = entry.lanes.byId.get(slot.lane);
        requireCourse(lane !== undefined, `${path}/${i}/lane`, 'Unknown lane', 'unresolved_reference');
        check(
          courseBoundaryAt(lane.width, position.s) > 0,
          `${path}/${i}/lane`,
          'A grid slot lies in a lane wider than zero',
        );
        const l = courseBoundaryAt(lane.center, position.s);
        check(surface.sample(position.s, l) !== null, `${path}/${i}`, 'Grid must be supported');
        return Object.freeze({ at: position, l });
      }),
    );
  };
  const grid = compileGrid(startGate.grid, `${start.path}/grid`);
  const bikeGrid = startGate.bikeGrid && compileGrid(startGate.bikeGrid, `${start.path}/bikeGrid`);
  return Object.freeze({
    /** Every Session's grid, front to back. */
    grid,
    /** The grid of a Session whose competitors all ride bikes, front to back; null when `grid` serves it too. */
    bikeGrid,
    intervals: Object.freeze(intervals),
  });
}

type CourseGrids = Pick<ReturnType<typeof compileCourseGates>, 'grid' | 'bikeGrid'>;

/**
 * The slots a Session starts from: the course's bike grid when every competitor rides a bike and the course has one,
 * else its grid; of either, only the first `SESSION_RULE_LIMITS.competitors` (16) slots.
 */
export function courseStartGrid(gates: CourseGrids, bikesOnly: boolean): readonly CompiledGridSlot[] {
  return Object.freeze(((bikesOnly && gates.bikeGrid) || gates.grid).slice(0, SESSION_RULE_LIMITS.competitors));
}

/** How many competitors, the player included, every Session of a course can start: the fewer slots its grids use. */
export function courseGridCapacity(gates: CourseGrids): number {
  return Math.min(courseStartGrid(gates, false).length, courseStartGrid(gates, true).length);
}
