import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { CourseInputError } from '../../src/course/course-diagnostics.js';
import {
  readCourseDocument,
  type CoursePosition,
  type Lateral,
  type SectionDocument,
} from '../../src/course/course-document.js';
import { compileCourseGeometry, resolveCoursePosition } from '../../src/course/course-geometry.js';
import {
  compileCourseBoundaries,
  resolveCourseLateral,
  resolveLateralInterval,
} from '../../src/course/compiler/course-lateral.js';
import type { CompiledBoundary } from '../../src/course/course-boundaries.js';
import { expandCourseElements, type CourseRepeatCopy, type RepeatElement } from '../../src/course/course-repeat.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { Profile } from '../../src/course/geometry/profile.js';

/**
 * A course's form: every element an author draws or edits, where it is in the document (its JSON Pointer), where it
 * resolves (Section, s, l, height, plan x and z), and how it is written: the PI its position is measured from, whether
 * a lateral is a number or a Boundary reference, which repetition of which `repeat` it is, and whether a point is
 * written in the document or derived from it. Positions, repetitions, laterals and Boundaries resolve through the
 * course compiler's own functions. A document admission or compilation rejects is read as far as it goes; an element
 * that does not resolve carries the reason.
 */

export type CourseElementKind =
  | 'pi'
  | 'arc-end'
  | 'pvi'
  | 'curve-end'
  | 'boundary'
  | 'boundary-knot'
  | 'boundary-vertex'
  | 'repeat'
  | 'strip'
  | 'strip-knot'
  | 'arrow'
  | 'text'
  | 'curb'
  | 'wall'
  | 'wall-strip'
  | 'wall-strip-knot'
  | 'open-limit'
  | 'sprite'
  | 'object'
  | 'environment'
  | 'gate'
  | 'grid-slot'
  | 'carriageway';

/** A Position as written and as resolved: `offset` metres from PI `pi`, at station `s` (null when unresolved). */
export interface WrittenPosition {
  readonly pi: string;
  readonly offset: number;
  readonly s: number | null;
}

/** A lateral as written and as resolved at its element's station: a number, or a Boundary reference plus offset. */
export type WrittenLateral = (
  | { readonly form: 'absolute'; readonly value: number }
  | { readonly form: 'reference'; readonly boundary: string; readonly offset: number }
) & { readonly l: number | null };

/** A resolved line along a Section: its vertices, each written in the document or derived (inherited, interpolated). */
export type ResolvedLine = readonly { readonly s: number; readonly l: number; readonly authored: boolean }[];

export interface CourseElement {
  readonly kind: CourseElementKind;
  /** The element in the document; a repeated element's is its one authored record. */
  readonly pointer: string;
  readonly section: string;
  /** The repetitions enclosing this copy, outermost first, with each `repeat`'s count and spacing; empty if none. */
  readonly copies: readonly (CourseRepeatCopy & { readonly count: number; readonly every: number })[];
  /** Written in the document (PI, PVI, knot, placement) or derived from it (arc end, curve end, inherited vertex). */
  readonly point: 'authored' | 'derived';
  /** The written element a derived point comes from. */
  readonly derivedFrom: string | null;
  /** Each Position field (`at`, `start`, `end`, `from`, `to`) as written and resolved. */
  readonly positions: Readonly<Record<string, WrittenPosition>>;
  /** Each lateral field (`lateral`, `left`, `right`) as written and resolved; an open edge is absent. */
  readonly laterals: Readonly<Record<string, WrittenLateral>>;
  /** Where the element resolves; null when it does not. */
  readonly s: number | null;
  readonly l: number | null;
  readonly y: number | null;
  readonly x: number | null;
  readonly z: number | null;
  /** Resolved lines: a Boundary's vertices, a Strip's or curb's `left` and `right` edges, a wall's line. */
  readonly lines: Readonly<Record<string, ResolvedLine>>;
  /** Other written values that identify the element (`id`, `kind`, `color`, `image`, `boundary`, `every`...). */
  readonly values: Readonly<Record<string, unknown>>;
  /** Why the element did not resolve. */
  readonly problem: { readonly code: string; readonly message: string; readonly pointer: string } | null;
}

export interface SectionStructure {
  readonly id: string;
  readonly pointer: string;
  /** The Section's length; null when its plan does not compile. */
  readonly length: number | null;
  readonly elements: readonly CourseElement[];
}

export interface CourseStructure {
  readonly sections: readonly SectionStructure[];
  readonly links: readonly {
    readonly pointer: string;
    readonly id: string;
    readonly from: { readonly sectionId: string; readonly carriagewayId: string };
    readonly to: { readonly sectionId: string };
  }[];
  readonly entrySectionId: string | null;
  /** The document admission's diagnostic, when it rejects the document; the form is read as far as it goes. */
  readonly admission: { readonly code: string; readonly message: string; readonly pointer: string } | null;
}

type Problem = NonNullable<CourseElement['problem']>;
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** The problem a resolution raised: a course input error's code and pointer, else an unreadable value. */
function problemOf(error: unknown, pointer: string): Problem {
  if (error instanceof CourseInputError) return { code: error.code, message: error.message, pointer: error.path };
  if (error instanceof TypeError || error instanceof RangeError)
    return { code: 'unreadable', message: error.message, pointer };
  throw error;
}

/** Read a course document's form. */
export function readCourseStructure(value: unknown): CourseStructure {
  const admitted = readCourseDocument(value);
  const document = record(value);
  const sections = list(document.sections).map((section, i) =>
    readSection(record(section) as unknown as SectionDocument, `/sections/${i}`),
  );
  const first = admitted.ok ? null : admitted.diagnostics[0];
  return {
    sections,
    links: list(document.links).map((link, i) => {
      const v = record(link);
      return {
        pointer: `/links/${i}`,
        id: String(v.id ?? ''),
        from: record(v.from) as unknown as CourseStructure['links'][number]['from'],
        to: record(v.to) as unknown as CourseStructure['links'][number]['to'],
      };
    }),
    entrySectionId: typeof document.entrySectionId === 'string' ? document.entrySectionId : null,
    admission: first
      ? { code: first.code, message: first.message, pointer: ('path' in first ? first.path : '') ?? '' }
      : null,
  };
}

function readSection(section: SectionDocument, pointer: string): SectionStructure {
  const elements: CourseElement[] = [];
  const id = String(section.id ?? '');
  // The plan: PI stations, the ruler and the coordinate reader that places (s, l) in the plan.
  let plan: ReturnType<typeof compileCourseGeometry> | null = null,
    planProblem: Problem | null = null;
  try {
    plan = compileCourseGeometry(section, pointer);
  } catch (error) {
    planProblem = problemOf(error, `${pointer}/pis`);
  }
  const length = plan?.length ?? null;
  const reader = plan
    ? createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
        out.left = -COURSE_DOCUMENT_LIMITS.lateralMeters;
        out.right = COURSE_DOCUMENT_LIMITS.lateralMeters;
        return out;
      })
    : null;
  const sample = createPlanCoordinateSample();
  const world = (s: number | null, l: number | null) => {
    if (!reader || s === null) return { x: null, z: null };
    const point = reader.toWorld(s, l ?? 0, sample);
    return { x: point.x, z: point.z };
  };
  const resolve = (at: CoursePosition, path: string) => {
    if (!plan) throw new CourseInputError('invalid_plan', path, planProblem?.message ?? 'The plan does not compile');
    return resolveCoursePosition(at, plan.stations, plan.length, path);
  };
  // Boundaries resolve together, as the compiler resolves them; on failure each knot still reads alone.
  let boundaries: ReadonlyMap<string, CompiledBoundary> = new Map();
  let boundaryProblem: Problem | null = null;
  try {
    boundaries = new Map(
      compileCourseBoundaries(
        list(section.boundaries) as SectionDocument['boundaries'],
        resolve,
        `${pointer}/boundaries`,
      ).map((boundary) => [boundary.id, boundary]),
    );
  } catch (error) {
    boundaryProblem = problemOf(error, `${pointer}/boundaries`);
  }
  let height: Profile | null = null;
  try {
    const nodes = list(section.height).map((node, i) => {
      const v = record(node);
      return {
        s: resolve(v.at as CoursePosition, `${pointer}/height/${i}/at`).s,
        y: Number(v.y),
        curveLength: Number(v.curveLength),
      };
    });
    if (length !== null) height = new Profile(length, nodes);
  } catch {
    height = null;
  }

  /** One element: its written positions and laterals resolved at the element's station. */
  const add = (
    kind: CourseElementKind,
    at: string,
    source: Record<string, unknown>,
    options: {
      offset?: number;
      copies?: readonly CourseRepeatCopy[];
      positions?: readonly string[];
      laterals?: readonly string[];
      values?: Record<string, unknown>;
      lines?: Record<string, ResolvedLine>;
      point?: 'authored' | 'derived';
      derivedFrom?: string;
      station?: { s: number; l: number };
      problem?: Problem | null;
    } = {},
  ) => {
    let problem: Problem | null = options.problem ?? null;
    const positions: Record<string, WrittenPosition> = {};
    for (const field of options.positions ?? []) {
      const written = record(source[field]);
      let s: number | null = null;
      try {
        s = resolve(written as unknown as CoursePosition, `${at}/${field}`).s + (options.offset ?? 0);
        if (length !== null && (s < 0 || s > length))
          throw new CourseInputError('invalid_position', `${at}/${field}`, 'Repeated Position is outside its Section');
      } catch (error) {
        problem ??= problemOf(error, `${at}/${field}`);
        s = null;
      }
      positions[field] = { pi: String(written.pi ?? ''), offset: Number(written.offset), s };
    }
    const s = options.station?.s ?? Object.values(positions)[0]?.s ?? null;
    const laterals: Record<string, WrittenLateral> = {};
    for (const field of options.laterals ?? []) {
      const written = source[field] as Lateral | null | undefined;
      if (written === null || written === undefined) continue;
      let l: number | null = null;
      if (s !== null)
        try {
          l = resolveCourseLateral(written, s, boundaries, `${at}/${field}`);
        } catch (error) {
          problem ??= problemOf(error, `${at}/${field}`);
        }
      laterals[field] =
        typeof written === 'number'
          ? { form: 'absolute', value: written, l }
          : { form: 'reference', boundary: String(written.boundary), offset: Number(written.offset), l };
    }
    const l = options.station?.l ?? Object.values(laterals)[0]?.l ?? null;
    const copies = (options.copies ?? []).map((copy) => {
      const repeat = record(valueAt(section, copy.path.slice(pointer.length)));
      return { ...copy, count: Number(repeat.count), every: Number(repeat.every) };
    });
    elements.push({
      kind,
      pointer: at,
      section: id,
      copies,
      point: options.point ?? 'authored',
      derivedFrom: options.derivedFrom ?? null,
      positions,
      laterals,
      s,
      l,
      y: height && s !== null ? height.sample(s) : null,
      ...world(s, l),
      lines: options.lines ?? {},
      values: options.values ?? {},
      problem,
    });
  };

  // The plan: written PIs, and the arc ends the plan derives between them.
  list(section.pis).forEach((pi, i) => {
    const v = record(pi);
    const s = plan?.stations.get(String(v.id)) ?? null;
    elements.push({
      ...blank('pi', `${pointer}/pis/${i}`, id),
      s,
      l: 0,
      y: height && s !== null ? height.sample(s) : null,
      x: Number(v.x),
      z: Number(v.z),
      values: { id: v.id, radius: v.radius },
      problem:
        s === null
          ? (planProblem ?? { code: 'invalid_plan', message: 'Unresolved PI', pointer: `${pointer}/pis/${i}` })
          : null,
    });
  });
  for (const segment of plan?.segments ?? [])
    if (segment.geometry.kind === 'arc')
      for (const s of [segment.sStart, segment.sEnd])
        add('arc-end', `${pointer}/pis`, {}, { point: 'derived', derivedFrom: `${pointer}/pis`, station: { s, l: 0 } });
  // The profile: written PVIs and the vertical curve ends they derive.
  list(section.height).forEach((node, i) => {
    const at = `${pointer}/height/${i}`;
    const v = record(node);
    add('pvi', at, v, { positions: ['at'], values: { y: v.y, curveLength: v.curveLength } });
    const pvi = elements.at(-1)!;
    if (pvi.s !== null && Number(v.curveLength) > 0)
      for (const s of [pvi.s - Number(v.curveLength) / 2, pvi.s + Number(v.curveLength) / 2])
        add('curve-end', at, {}, { point: 'derived', derivedFrom: at, station: { s, l: 0 } });
  });
  // Boundaries: written knots, and every vertex the compiler resolves, written or inherited.
  list(section.boundaries).forEach((boundary, i) => {
    const at = `${pointer}/boundaries/${i}`;
    const v = record(boundary);
    const compiled = boundaries.get(String(v.id));
    const knots = list(v.knots).map((knot) => record(knot));
    const own = new Set<number>();
    knots.forEach((knot, k) => {
      add('boundary-knot', `${at}/knots/${k}`, knot, {
        positions: ['at'],
        laterals: ['lateral'],
        values: { boundary: v.id },
      });
      const s = elements.at(-1)!.s;
      if (s !== null) own.add(s);
    });
    const line: ResolvedLine = (compiled?.vertices ?? []).map((vertex) => ({
      s: vertex.at.s,
      l: vertex.l,
      authored: own.has(vertex.at.s),
    }));
    add('boundary', at, v, {
      values: { id: v.id },
      lines: { line },
      station: line[0] ? { s: line[0].s, l: line[0].l } : undefined,
      problem: compiled ? null : (boundaryProblem ?? null),
    });
    for (const vertex of line)
      if (!vertex.authored)
        add('boundary-vertex', at, {}, { point: 'derived', derivedFrom: at, station: { s: vertex.s, l: vertex.l } });
  });
  // Road Strips and their decorations, each repetition resolved at its own stations.
  const repeats = (elementsAt: unknown, path: string) => {
    const visit = (items: readonly unknown[], at: string) =>
      items.forEach((item, i) => {
        const v = record(item);
        if (v.kind !== 'repeat') return;
        add('repeat', `${at}/${i}`, v, { values: { every: v.every, count: v.count } });
        visit(list(v.elements), `${at}/${i}/elements`);
      });
    visit(list(elementsAt), path);
  };
  const expand = (
    items: unknown,
    at: string,
    each: (source: Record<string, unknown>, offset: number, path: string, copies: readonly CourseRepeatCopy[]) => void,
  ) => {
    try {
      expandCourseElements(
        list(items) as RepeatElement<object>[],
        at,
        COURSE_DOCUMENT_LIMITS.stripExpansion,
        (source, offset, path, _repeated, copies) => each(record(source), offset, path, copies),
      );
    } catch (error) {
      add('repeat', at, {}, { problem: problemOf(error, at) });
    }
  };
  /** The two edges of a knot interval list, resolved as the Strip compiler resolves them. */
  const edges = (knots: readonly Record<string, unknown>[], stations: readonly (number | null)[], at: string) => {
    const lines: Record<string, ResolvedLine> = {};
    for (const side of ['left', 'right'] as const) {
      const line: { s: number; l: number; authored: boolean }[] = [];
      for (let k = 1; k < knots.length; k++) {
        const a = knots[k - 1]![side] as Lateral | null,
          b = knots[k]![side] as Lateral | null,
          start = stations[k - 1],
          end = stations[k];
        if (a === null || b === null || start === null || start === undefined || end === null || end === undefined)
          continue;
        try {
          const resolved = resolveLateralInterval(
            a,
            b,
            start,
            end,
            (id) => boundaries.get(id),
            `${at}/knots/${k}/${side}`,
          );
          for (const vertex of resolved.vertices.slice(line.length && k > 1 ? 1 : 0))
            line.push({ s: vertex.at.s, l: vertex.l, authored: vertex.at.s === start || vertex.at.s === end });
        } catch {
          // The knot's own element carries the problem.
        }
      }
      if (line.length) lines[side] = line;
    }
    return lines;
  };
  repeats(section.strips, `${pointer}/strips`);
  expand(section.strips, `${pointer}/strips`, (source, offset, path, copies) => {
    const kind = String(source.kind);
    if (kind === 'strip') {
      const knots = list(source.knots).map(record);
      const before = elements.length;
      knots.forEach((knot, k) =>
        add('strip-knot', `${path}/knots/${k}`, knot, {
          offset,
          copies,
          positions: ['at'],
          laterals: ['left', 'right'],
        }),
      );
      const stations = elements.slice(before).map((element) => element.s);
      add('strip', path, source, {
        offset,
        copies,
        values: { color: source.color, material: source.material },
        lines: edges(knots, stations, path),
        station: typeof stations[0] === 'number' ? { s: stations[0], l: 0 } : undefined,
      });
    } else if (kind === 'curb') {
      add('curb', path, source, {
        offset,
        copies,
        positions: ['start', 'end'],
        laterals: ['left', 'right'],
        values: { stripe: source.stripe, colors: source.colors },
      });
    } else if (kind === 'arrow' || kind === 'text')
      add(kind, path, source, {
        offset,
        copies,
        positions: ['at'],
        laterals: ['lateral'],
        values:
          kind === 'arrow'
            ? { direction: source.direction, color: source.color }
            : { text: source.text, color: source.color },
      });
  });
  // Walls: the Boundary line they follow and their color Strips.
  list(section.walls).forEach((wall, i) => {
    const at = `${pointer}/walls/${i}`;
    const v = record(wall);
    const boundary = boundaries.get(String(v.boundary));
    add('wall', at, v, { positions: ['from', 'to'], values: { boundary: v.boundary, solid: v.solid !== null } });
    const element = elements.at(-1)!;
    const from = element.positions.from?.s,
      to = element.positions.to?.s;
    if (boundary && typeof from === 'number' && typeof to === 'number')
      elements[elements.length - 1] = {
        ...element,
        lines: {
          line: [from, ...boundary.vertices.map((vertex) => vertex.at.s).filter((s) => s > from && s < to), to].map(
            (s) => ({
              s,
              l: resolveCourseLateral({ boundary: boundary.id, offset: 0 }, s, boundaries, at),
              authored: s === from || s === to,
            }),
          ),
        },
      };
    repeats(v.strips, `${at}/strips`);
    expand(v.strips, `${at}/strips`, (source, offset, path, copies) => {
      list(source.knots).forEach((knot, k) => {
        const kv = record(knot);
        add('wall-strip-knot', `${path}/knots/${k}`, kv, {
          offset,
          copies,
          positions: ['at'],
          values: { bottom: kv.bottom, top: kv.top },
        });
      });
      add('wall-strip', path, source, { offset, copies, values: { color: source.color } });
    });
  });
  list(section.openLimits).forEach((limit, i) =>
    add('open-limit', `${pointer}/openLimits/${i}`, record(limit), {
      positions: ['from', 'to'],
      values: { side: record(limit).side },
    }),
  );
  // Sprites: each placement, its body making it an object.
  repeats(section.sprites, `${pointer}/sprites`);
  expand(section.sprites, `${pointer}/sprites`, (source, offset, path, copies) =>
    add(source.body ? 'object' : 'sprite', path, source, {
      offset,
      copies,
      positions: ['at'],
      laterals: ['lateral'],
      values: { image: source.image, palette: source.palette },
    }),
  );
  repeats(section.environments, `${pointer}/environments`);
  expand(section.environments, `${pointer}/environments`, (source, offset, path, copies) =>
    add('environment', path, source, { offset, copies, positions: ['at'], values: { name: source.name } }),
  );
  list(section.gates).forEach((gate, i) => {
    const at = `${pointer}/gates/${i}`;
    const v = record(gate);
    if (v.kind === 'start')
      list(v.grid).forEach((slot, k) =>
        add('grid-slot', `${at}/grid/${k}`, record(slot), {
          positions: ['at'],
          laterals: ['lateral'],
          values: { slot: k },
        }),
      );
    else add('gate', at, v, { positions: ['at'], values: { kind: v.kind, id: v.id, carriageway: v.carriageway } });
  });
  list(section.carriageways).forEach((road, i) => {
    const v = record(road);
    add('carriageway', `${pointer}/carriageways/${i}`, v, {
      values: { id: v.id, left: v.left, right: v.right, lanes: v.lanes },
    });
  });
  return { id, pointer, length, elements };
}

/** An element with nothing resolved yet. */
function blank(kind: CourseElementKind, pointer: string, section: string): CourseElement {
  return {
    kind,
    pointer,
    section,
    copies: [],
    point: 'authored',
    derivedFrom: null,
    positions: {},
    laterals: {},
    s: null,
    l: null,
    y: null,
    x: null,
    z: null,
    lines: {},
    values: {},
    problem: null,
  };
}

/** The value at a JSON Pointer relative to `root`, undefined when absent. */
function valueAt(root: unknown, pointer: string): unknown {
  let value = root;
  for (const token of pointer.split('/').slice(1)) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    value = Array.isArray(value) ? value[Number(key)] : record(value)[key];
  }
  return value;
}
