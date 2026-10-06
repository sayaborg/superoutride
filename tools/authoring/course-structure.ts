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
  courseLineLookup,
  resolveCourseLateral,
  resolveLateralInterval,
} from '../../src/course/compiler/course-lateral.js';
import { courseLaneCenterAt, type CompiledBoundary } from '../../src/course/course-boundaries.js';
import { expandCourseElements, type CourseRepeatCopy, type RepeatElement } from '../../src/course/course-repeat.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { valueAt, type Json } from './json-pointer.js';
import type { ProfileReader } from '../../src/course/geometry/profile.js';
import { compileCoursePhysicalContent } from '../../src/course/compiler/course-physical-content.js';
import { compileCourseLanes } from '../../src/course/compiler/course-lanes.js';
import type { CompiledLane, CompiledLanes, CourseLines } from '../../src/course/course-lanes.js';

/** The lanes of a Section whose lanes do not compile: none, so lane references do not resolve. */
const NO_LANES: CompiledLanes = Object.freeze({
  elements: [],
  byId: new Map(),
  center: undefined as unknown as CompiledLane,
});

/**
 * A course's form: every element an author draws or edits, where it is in the document (its JSON Pointer), where it
 * resolves (Section, s, l, height, plan x and z), and how it is written: the joint its position is measured from, whether
 * a lateral is a number or a Boundary reference, which repetition of which `repeat` it is, and whether a point is
 * written in the document or derived from it. Positions, repetitions, laterals and Boundaries resolve through the
 * course compiler's own functions. A document admission or compilation rejects is read as far as it goes; an element
 * that does not resolve carries the reason.
 */

export type CourseElementKind =
  | 'plan'
  | 'plan-end'
  | 'tangent-point'
  | 'pvi'
  | 'curve-end'
  | 'boundary'
  | 'boundary-knot'
  | 'boundary-vertex'
  | 'repeat'
  | 'strip'
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

/** A Position as written and as resolved: `offset` metres from joint `joint`, at station `s` (null when unresolved). */
export interface WrittenPosition {
  readonly joint: string;
  readonly offset: number;
  readonly s: number | null;
}

/**
 * A lateral as written and as resolved at its element's station: a number, a Boundary reference plus offset, or a lane's
 * line plus offset.
 */
export type WrittenLateral = (
  | { readonly form: 'absolute'; readonly value: number }
  | { readonly form: 'reference'; readonly boundary: string; readonly offset: number }
  | {
      readonly form: 'lane';
      readonly lane: string;
      readonly side: 'left' | 'center' | 'right';
      readonly offset: number;
    }
) & { readonly l: number | null };

/** The line a reference lateral reads, for people: `Boundary <id>` or `lane <id> <side>`. */
export function lateralLineName(lateral: Exclude<WrittenLateral, { form: 'absolute' }>): string {
  return lateral.form === 'reference' ? `Boundary ${lateral.boundary}` : `lane ${lateral.lane} ${lateral.side}`;
}

/** A resolved line along a Section: its vertices, each written in the document or derived (inherited, interpolated). */
export type ResolvedLine = readonly { readonly s: number; readonly l: number; readonly authored: boolean }[];

export interface CourseElement {
  readonly kind: CourseElementKind;
  /** The element in the document; a repeated element's is its one authored record. */
  readonly pointer: string;
  readonly section: string;
  /** The repetitions enclosing this copy, outermost first, with each `repeat`'s count and spacing; empty if none. */
  readonly copies: readonly (CourseRepeatCopy & { readonly count: number; readonly every: number })[];
  /** Written in the document (plan element, PVI, knot, placement) or derived from it (Section end, curve end, inherited vertex). */
  readonly point: 'authored' | 'derived';
  /** The written element a derived point comes from. */
  readonly derivedFrom: string | null;
  /** Each Position field (`at`, `start`, `end`) as written and resolved. */
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
    readonly from: { readonly section: string; readonly carriageway: string };
    readonly to: string;
  }[];
  readonly entry: string | null;
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
  const sections = list(document.sections).map(
    (section, i) => readSection(record(section) as unknown as SectionDocument, `/sections/${i}`).structure,
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
        to: String(v.to ?? ''),
      };
    }),
    entry: typeof document.entry === 'string' ? document.entry : null,
    admission: first
      ? { code: first.code, message: first.message, pointer: ('path' in first ? first.path : '') ?? '' }
      : null,
  };
}

/** One Section's form, plan and profile, read alone: what a view redraws while an edit is pending. */
export function readCourseSection(value: unknown, index: number) {
  return readSection(record(list(record(value).sections)[index]) as unknown as SectionDocument, `/sections/${index}`);
}

/**
 * A Section's plan as the compiler builds it: its ruler `length`, plan segments and joint stations, the plan point and
 * heading of (s, l), and the station nearest a plan point. Null with the problem when the plan does not compile.
 */
export function createSectionPlan(section: SectionDocument, pointer: string) {
  let geometry: ReturnType<typeof compileCourseGeometry>;
  try {
    geometry = compileCourseGeometry(section, pointer);
  } catch (error) {
    return { plan: null, problem: problemOf(error, `${pointer}/plan`) };
  }
  const reader = createPlanCoordinateReader(geometry.segments, geometry.length, (_s, out) => {
    out.left = -COURSE_DOCUMENT_LIMITS.lateralMeters;
    out.right = COURSE_DOCUMENT_LIMITS.lateralMeters;
    return out;
  });
  const sample = createPlanCoordinateSample();
  const candidate = { s: 0, l: 0, isFoot: false, distanceSquared: 0 };
  const candidates = reader.projectionCandidates(0, geometry.length);
  return {
    plan: Object.freeze({
      length: geometry.length,
      segments: geometry.segments,
      stations: geometry.joints.stations,
      joints: geometry.joints,
      toWorld(s: number, l: number) {
        const point = reader.toWorld(s, l, sample);
        return { x: point.x, z: point.z, heading: point.heading };
      },
      /** The station and lateral of the plan point nearest `(x, z)` on the Section's ruler. */
      nearest(x: number, z: number) {
        let best = { s: 0, l: 0, distanceSquared: Infinity };
        for (const interval of candidates) {
          interval.project({ x, z }, interval.start, interval.end, candidate);
          if (candidate.distanceSquared < best.distanceSquared)
            best = { s: candidate.s, l: candidate.l, distanceSquared: candidate.distanceSquared };
        }
        return { s: best.s, l: best.l };
      },
    }),
    problem: null,
  };
}
export type SectionPlan = NonNullable<ReturnType<typeof createSectionPlan>['plan']>;

/** A Section's road height as the compiler builds it from the PVIs, or null with the problem. */
export function createSectionProfile(section: SectionDocument, pointer: string, plan: SectionPlan | null) {
  if (!plan) return { profile: null, problem: null };
  try {
    const resolve = (at: CoursePosition, path: string) => resolveCoursePosition(at, plan.joints, path);
    return { profile: compileCoursePhysicalContent(section, plan.length, resolve, pointer).height, problem: null };
  } catch (error) {
    return { profile: null, problem: problemOf(error, `${pointer}/profile`) };
  }
}

function readSection(
  section: SectionDocument,
  pointer: string,
): { structure: SectionStructure; plan: SectionPlan | null; profile: ProfileReader | null } {
  const elements: CourseElement[] = [];
  const id = String(section.id ?? '');
  // The plan: joint stations, the ruler and the coordinate reader that places (s, l) in the plan.
  const { plan, problem: planProblem } = createSectionPlan(section, pointer);
  const length = plan?.length ?? null;
  const world = (s: number | null, l: number | null) => {
    if (!plan || s === null) return { x: null, z: null };
    const point = plan.toWorld(s, l ?? 0);
    return { x: point.x, z: point.z };
  };
  const resolve = (at: CoursePosition, path: string) => {
    if (!plan) throw new CourseInputError('invalid_plan', path, planProblem?.message ?? 'The plan does not compile');
    return resolveCoursePosition(at, plan.joints, path);
  };
  // The lanes, then the Boundaries, resolve together, as the compiler resolves them; on failure each knot still reads
  // alone.
  let lanes: CompiledLanes = NO_LANES;
  let boundaries: ReadonlyMap<string, CompiledBoundary> = new Map();
  let boundaryProblem: Problem | null = null;
  try {
    if (plan) lanes = compileCourseLanes(section, resolve, plan.length, `${pointer}/lanes`);
  } catch (error) {
    boundaryProblem = problemOf(error, `${pointer}/lanes`);
  }
  try {
    boundaries = new Map(
      compileCourseBoundaries(
        list(section.boundaries) as SectionDocument['boundaries'],
        lanes,
        resolve,
        `${pointer}/boundaries`,
      ).map((boundary) => [boundary.id, boundary]),
    );
  } catch (error) {
    boundaryProblem ??= problemOf(error, `${pointer}/boundaries`);
  }
  const courseLines: CourseLines = { boundaries, lanes };
  const height = createSectionProfile(section, pointer, plan).profile;

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
      /** The plan point, where it is not the station's (s, l). */
      planPoint?: { x: number; z: number };
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
      positions[field] = { joint: String(written.joint ?? ''), offset: Number(written.offset), s };
    }
    const s = options.station?.s ?? Object.values(positions)[0]?.s ?? null;
    const laterals: Record<string, WrittenLateral> = {};
    for (const field of options.laterals ?? []) {
      const written = source[field] as Lateral | null | undefined;
      if (written === null || written === undefined) continue;
      let l: number | null = null;
      if (s !== null)
        try {
          l = resolveCourseLateral(written, s, courseLines, `${at}/${field}`);
        } catch (error) {
          problem ??= problemOf(error, `${at}/${field}`);
        }
      laterals[field] =
        typeof written === 'number'
          ? { form: 'absolute', value: written, l }
          : 'lane' in written
            ? { form: 'lane', lane: written.lane, side: written.side, offset: Number(written.offset), l }
            : { form: 'reference', boundary: String(written.boundary), offset: Number(written.offset), l };
    }
    const l = options.station?.l ?? Object.values(laterals)[0]?.l ?? null;
    const copies = (options.copies ?? []).map((copy) => {
      const repeat = record(valueAt(section as unknown as Json, copy.path.slice(pointer.length)));
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
      ...(options.planPoint ?? world(s, l)),
      lines: options.lines ?? {},
      values: options.values ?? {},
      problem,
    });
  };

  // The plan: each written element at its start, its joint, and the Section's end.
  list(section.plan).forEach((element, i) => {
    const v = record(element);
    const s = plan?.stations.get(String(v.id)) ?? null;
    add(
      'plan',
      `${pointer}/plan/${i}`,
      {},
      {
        values: { id: v.id, kind: v.kind, length: v.length, radius: v.radius, turn: v.turn },
        ...(s === null
          ? {
              problem: planProblem ?? {
                code: 'invalid_plan',
                message: 'Unresolved plan element',
                pointer: `${pointer}/plan/${i}`,
              },
            }
          : { station: { s, l: 0 } }),
      },
    );
  });
  if (plan) {
    add(
      'plan-end',
      `${pointer}/plan`,
      {},
      { point: 'derived', derivedFrom: `${pointer}/plan`, station: { s: plan.length, l: 0 } },
    );
    // Each arc of less than half a circle: where its tangents meet, a handle for its radius.
    list(section.plan).forEach((element, i) => {
      const v = record(element);
      const start = plan.stations.get(String(v.id));
      const length = Number(v.length),
        radius = Number(v.radius);
      if (v.kind !== 'arc' || start === undefined || !(length / radius < Math.PI)) return;
      const from = plan.toWorld(start, 0),
        reach = radius * Math.tan(length / radius / 2);
      add(
        'tangent-point',
        `${pointer}/plan/${i}`,
        {},
        {
          point: 'derived',
          derivedFrom: `${pointer}/plan/${i}`,
          station: { s: start + length / 2, l: 0 },
          planPoint: { x: from.x + reach * Math.sin(from.heading), z: from.z + reach * Math.cos(from.heading) },
        },
      );
    });
  }
  // The profile: written PVIs and the vertical curve ends they derive.
  list(section.profile).forEach((node, i) => {
    const at = `${pointer}/profile/${i}`;
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
  /** The two edges of a Strip (its edges at its start and end), resolved as the Strip compiler resolves them. */
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
          const resolved = resolveLateralInterval(a, b, start, end, courseLineLookup(courseLines), `${at}/${side}`);
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
      const before = elements.length;
      add('strip', path, source, {
        offset,
        copies,
        positions: ['start', 'end'],
        laterals: ['left', 'right'],
        values: { color: source.color, material: source.material },
      });
      const strip = elements[before]!;
      elements[before] = {
        ...strip,
        lines: edges([source, source], [strip.positions.start?.s ?? null, strip.positions.end?.s ?? null], path),
      };
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
    add('wall', at, v, { positions: ['start', 'end'], values: { boundary: v.boundary, solid: v.solid !== null } });
    const element = elements.at(-1)!;
    const from = element.positions.start?.s,
      to = element.positions.end?.s;
    if (boundary && typeof from === 'number' && typeof to === 'number')
      try {
        elements[elements.length - 1] = {
          ...element,
          lines: {
            line: [from, ...boundary.vertices.map((vertex) => vertex.at.s).filter((s) => s > from && s < to), to].map(
              (s) => ({
                s,
                l: resolveCourseLateral({ boundary: boundary.id, offset: 0 }, s, courseLines, at),
                authored: s === from || s === to,
              }),
            ),
          },
        };
      } catch (error) {
        // A wall its Boundary does not cover keeps no line, with the problem.
        elements[elements.length - 1] = { ...element, problem: element.problem ?? problemOf(error, `${at}/boundary`) };
      }
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
      positions: ['start', 'end'],
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
  // Carriageways: each lane's centre line over the road's existence, as the race reads it.
  list(section.carriageways).forEach((road, i) => {
    const v = record(road);
    const left = boundaries.get(String(v.left)),
      right = boundaries.get(String(v.right)),
      lanes = Number(v.lanes);
    const lines: Record<string, ResolvedLine> = {};
    let station: { s: number; l: number } | undefined;
    if (left && right && Number.isInteger(lanes) && lanes > 0) {
      const start = Math.max(left.vertices[0]!.at.s, right.vertices[0]!.at.s),
        end = Math.min(left.vertices.at(-1)!.at.s, right.vertices.at(-1)!.at.s);
      const stations = [...new Set([start, end, ...[...left.vertices, ...right.vertices].map((vertex) => vertex.at.s)])]
        .filter((s) => s >= start && s <= end)
        .sort((a, b) => a - b);
      const carriageway = { id: String(v.id), left, right, lanes };
      for (let lane = 0; lane < lanes; lane++)
        lines[`lane${lane}`] = stations.map((s) => ({
          s,
          l: courseLaneCenterAt(carriageway, lane, s),
          authored: false,
        }));
      if (stations.length) station = { s: stations[0]!, l: lines.lane0![0]!.l };
    }
    add('carriageway', `${pointer}/carriageways/${i}`, v, {
      values: { id: v.id, left: v.left, right: v.right, lanes: v.lanes },
      lines,
      station,
    });
  });
  return { structure: { id, pointer, length, elements }, plan, profile: height };
}
