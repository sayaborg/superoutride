import { snapCourseValue, type CourseChange } from './course-edits.js';
import { combineCourseElements, sectionShift } from './course-forms.js';
import {
  readCourseSection,
  readCourseStructure,
  type CourseElement,
  type CourseElementKind,
  type ResolvedLine,
  type SectionPlan,
} from './course-structure.js';
import { valueAt, withValue, type Json } from './json-pointer.js';
import type { ProfileReader } from '../../src/course/geometry/profile.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';

/**
 * One change a cleaning operation proposes: where it is (the element's Pointer, for the figure), what it changes, and
 * how far the course moves when it alone is applied (`shift`, metres). Every applied candidate changes the course
 * document, so the measured products always become stale; the driving changes only when the shift is not 0.
 */
export interface CleaningCandidate {
  readonly id: string;
  readonly operation: string;
  readonly pointer: string;
  readonly description: string;
  readonly changes: readonly CourseChange[];
  readonly shift: number;
}

/** Where a cleaning operation looks: a Section (its id), elements (their Pointers or what they hold), element kinds. */
export interface CleaningScope {
  readonly section?: string;
  readonly pointers?: readonly string[];
  readonly kinds?: readonly CourseElementKind[];
}

/** The course moved by applied candidates: the largest move, and each changed Section's centreline and length. */
export interface CleaningResult {
  readonly ok: true;
  readonly document: Json;
  readonly changes: readonly CourseChange[];
  readonly shift: number;
  readonly sections: readonly { readonly id: string; readonly centreline: number; readonly length: number }[];
}

/** The elements a scope covers: authored, each record once. */
function scoped(document: Json, scope: CleaningScope) {
  const seen = new Set<string>();
  return readCourseStructure(document).sections.flatMap((section, index) =>
    scope.section !== undefined && section.id !== scope.section
      ? []
      : section.elements.flatMap((element) => {
          const key = `${element.kind} ${element.pointer}`;
          if (element.point !== 'authored' || seen.has(key)) return [];
          if (scope.kinds && !scope.kinds.includes(element.kind)) return [];
          if (
            scope.pointers &&
            !scope.pointers.some((p) => element.pointer === p || element.pointer.startsWith(`${p}/`))
          )
            return [];
          seen.add(key);
          return [{ element, index }];
        }),
  );
}

/** Changes applied to a document: values set, then array items removed (an `after` absent), last first. */
export function applyCourseChanges(document: Json, changes: readonly CourseChange[]): Json {
  let next = document;
  for (const change of changes) if (change.after !== undefined) next = withValue(next, change.pointer, change.after);
  const removed = changes
    .filter((change) => change.after === undefined)
    .map((change) => {
      const at = change.pointer.lastIndexOf('/');
      return { parent: change.pointer.slice(0, at), index: Number(change.pointer.slice(at + 1)) };
    })
    .sort((a, b) => (a.parent === b.parent ? b.index - a.index : a.parent < b.parent ? 1 : -1));
  for (const { parent, index } of removed) {
    const list = valueAt(next, parent);
    if (Array.isArray(list)) next = withValue(next, parent, [...list.slice(0, index), ...list.slice(index + 1)]);
  }
  return next;
}

type Reading = ReturnType<typeof readCourseSection>;

/** A line's lateral at `s` by the course's own interpolation, or null outside it. */
function lineAt(line: ResolvedLine, s: number): number | null {
  if (!line.length || s < line[0]!.s || s > line.at(-1)!.s) return null;
  if (line.length === 1) return line[0]!.l;
  return courseBoundaryAt({ id: '', vertices: line.map((v) => ({ at: { s: v.s }, l: v.l })) }, s);
}

/** Whether two plans are the same ruler: the same length and PI stations. */
function samePlan(a: SectionPlan | null, b: SectionPlan | null) {
  if (!a || !b) return a === b;
  return a.length === b.length && [...a.stations].every(([pi, s]) => b.stations.get(pi) === s);
}

/** The greatest height difference of two profiles, sampled every 2 m over both. */
function profileShift(a: ProfileReader | null, b: ProfileReader | null, length: number) {
  if (!a || !b) return a === b ? 0 : Infinity;
  let shift = 0;
  for (let s = 0; s <= length; s += 2) shift = Math.max(shift, Math.abs(a.sample(s) - b.sample(s)));
  return shift;
}

/** Each wall Strip's `bottom` and `top` along s, from its knots (the same repetition), as lines of heights. */
function wallHeights(reading: Reading) {
  const elements = reading.structure.elements;
  const heights = new Map<string, Record<'bottom' | 'top', ResolvedLine>>();
  for (const strip of elements)
    if (strip.kind === 'wall-strip') {
      const copy = strip.copies.map((c) => c.index).join(',');
      const knots = elements.filter(
        (k) =>
          k.kind === 'wall-strip-knot' &&
          k.pointer.startsWith(`${strip.pointer}/knots/`) &&
          k.s !== null &&
          k.copies.map((c) => c.index).join(',') === copy,
      );
      const line = (key: 'bottom' | 'top') => knots.map((k) => ({ s: k.s!, l: Number(k.values[key]), authored: true }));
      heights.set(`${strip.pointer} ${copy}`, { bottom: line('bottom'), top: line('top') });
    }
  return heights;
}

/**
 * The greatest lateral (or height) difference of two lines along the same ruler, at either's vertices; a line that
 * starts or ends elsewhere moves by at least that distance.
 */
function lineShift(a: ResolvedLine, b: ResolvedLine) {
  if (!a.length || !b.length) return a.length === b.length ? 0 : Infinity;
  let shift = Math.max(Math.abs(a[0]!.s - b[0]!.s), Math.abs(a.at(-1)!.s - b.at(-1)!.s));
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const)
    for (const vertex of from) {
      const l = lineAt(to, vertex.s);
      if (l !== null) shift = Math.max(shift, Math.abs(l - vertex.l));
    }
  return shift;
}

/**
 * How far a Section moves between two readings: lines paired by their element (laterally when the ruler is the same,
 * else vertex by vertex in the plan), single elements paired by Pointer in the plan, and the road height. Infinity
 * when a reading fails or the elements no longer pair.
 */
function readingShift(before: Reading, after: Reading): number {
  if (!before.plan || !after.plan) return before.plan === after.plan ? 0 : Infinity;
  const same = samePlan(before.plan, after.plan);
  const key = (e: CourseElement) => `${e.kind} ${e.pointer} ${e.copies.map((c) => c.index).join(',')}`;
  const later = new Map<string, CourseElement[]>();
  for (const e of after.structure.elements) later.set(key(e), [...(later.get(key(e)) ?? []), e]);
  let shift = profileShift(before.profile, after.profile, Math.min(before.plan.length, after.plan.length));
  const counts = new Map<string, number>();
  for (const e of before.structure.elements) {
    const n = counts.get(key(e)) ?? 0;
    counts.set(key(e), n + 1);
    const f = later.get(key(e))?.[n];
    if (!f) {
      // A removed knot, or a later sibling renumbered by it, is measured through its element's lines.
      if (/knot|vertex|pvi|curve-end/.test(e.kind)) continue;
      return Infinity;
    }
    if (!/knot|vertex|curve-end/.test(e.kind) && e.x !== null && f.x !== null)
      shift = Math.max(shift, Math.hypot(e.x - f.x, e.z! - f.z!));
    for (const [name, line] of Object.entries(e.lines)) {
      const other = f.lines[name];
      if (!other) return Infinity;
      if (same) shift = Math.max(shift, lineShift(line, other));
      else if (line.length === other.length)
        line.forEach((v, i) => {
          const a = before.plan!.toWorld(v.s, v.l),
            b = after.plan!.toWorld(other[i]!.s, other[i]!.l);
          shift = Math.max(shift, Math.hypot(a.x - b.x, a.z - b.z));
        });
      else return Infinity;
    }
  }
  // Wall heights, along the same ruler or knot by knot.
  const walls = wallHeights(after);
  for (const [strip, heights] of wallHeights(before)) {
    const other = walls.get(strip);
    if (!other) return Infinity;
    for (const key of ['bottom', 'top'] as const)
      if (same) shift = Math.max(shift, lineShift(heights[key], other[key]));
      else if (heights[key].length === other[key].length)
        heights[key].forEach((v, i) => (shift = Math.max(shift, Math.abs(v.l - other[key][i]!.l))));
      else return Infinity;
  }
  return shift;
}

/** A Section's move between readings: paired by element, else (when elements were renumbered) in order. */
function shiftBetween(before: Reading, after: Reading) {
  const paired = readingShift(before, after);
  if (Number.isFinite(paired) || !samePlan(before.plan, after.plan)) return paired;
  return sectionShift(before.structure, after.structure) ?? Infinity;
}

/** The largest distance from the old centreline, sampled every 2 m, to the new one. */
function centrelineShift(before: SectionPlan | null, after: SectionPlan | null) {
  if (!before || !after) return before === after ? 0 : Infinity;
  if (samePlan(before, after)) return 0;
  let shift = 0;
  for (let s = 0; s <= before.length; s += 2) {
    const p = before.toWorld(s, 0);
    shift = Math.max(shift, Math.abs(after.nearest(p.x, p.z).l));
  }
  return shift;
}

/** The Section index a Pointer is in. */
const sectionIndexOf = (pointer: string) => Number(/^\/sections\/(\d+)/.exec(pointer)?.[1] ?? -1);

/** Candidates with their shift: each applied alone to the document and its Section read again. */
function withShifts(document: Json, proposals: readonly Omit<CleaningCandidate, 'shift'>[]): CleaningCandidate[] {
  const readings = new Map<number, Reading>();
  const before = (index: number) => {
    if (!readings.has(index)) readings.set(index, readCourseSection(document, index));
    return readings.get(index)!;
  };
  return proposals.map((proposal) => {
    const index = sectionIndexOf(proposal.pointer);
    const after = readCourseSection(applyCourseChanges(document, proposal.changes), index);
    return { ...proposal, shift: shiftBetween(before(index), after) };
  });
}

/**
 * Apply chosen candidates as one edit: the new document, every change, the largest move of anything the changed
 * Sections resolve, and each changed Section's centreline shift and length change.
 */
export function applyCleaning(document: Json, candidates: readonly CleaningCandidate[]): CleaningResult {
  const changes = candidates.flatMap((candidate) => candidate.changes);
  const next = applyCourseChanges(document, changes);
  const indexes = [...new Set(changes.map((change) => sectionIndexOf(change.pointer)))].filter((i) => i >= 0);
  let shift = 0;
  const sections = indexes.map((index) => {
    const before = readCourseSection(document, index),
      after = readCourseSection(next, index);
    shift = Math.max(shift, shiftBetween(before, after));
    return {
      id: before.structure.id,
      centreline: centrelineShift(before.plan, after.plan),
      length: (after.plan?.length ?? NaN) - (before.plan?.length ?? NaN),
    };
  });
  return { ok: true, document: next, changes, shift, sections };
}

/** The written numbers rounding can change, by name. */
export const ROUNDED_VALUES = ['pi', 'radius', 'offset', 'lateral', 'height', 'curveLength', 'every'] as const;
export type RoundedValue = (typeof ROUNDED_VALUES)[number];

/** An element's written numbers of the named kinds, each with its Pointer. */
function roundable(element: CourseElement, document: Json, values: readonly RoundedValue[]) {
  const found: { pointer: string; value: number }[] = [];
  const add = (pointer: string) => {
    const value = valueAt(document, pointer);
    if (typeof value === 'number') found.push({ pointer, value });
  };
  if (element.kind === 'pi') {
    if (values.includes('pi')) for (const key of ['x', 'z']) add(`${element.pointer}/${key}`);
    if (values.includes('radius')) add(`${element.pointer}/radius`);
    return found;
  }
  if (values.includes('offset'))
    for (const field of Object.keys(element.positions)) add(`${element.pointer}/${field}/offset`);
  if (values.includes('lateral'))
    for (const [field, lateral] of Object.entries(element.laterals))
      add(lateral.form === 'absolute' ? `${element.pointer}/${field}` : `${element.pointer}/${field}/offset`);
  if (element.kind === 'pvi') {
    if (values.includes('height')) add(`${element.pointer}/y`);
    if (values.includes('curveLength')) add(`${element.pointer}/curveLength`);
  }
  if (element.kind === 'repeat' && values.includes('every')) add(`${element.pointer}/every`);
  return found;
}

/** Round written numbers of the chosen kinds to a step: each value off the step is a candidate. */
export function roundCandidates(
  document: Json,
  options: { readonly step: number; readonly values: readonly RoundedValue[]; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  const proposals = scoped(document, options.scope ?? {}).flatMap(({ element }) =>
    roundable(element, document, options.values).flatMap(({ pointer, value }) => {
      const after = snapCourseValue(value, options.step);
      return after === value
        ? []
        : [
            {
              id: `round ${pointer}`,
              operation: 'round',
              pointer: element.pointer,
              description: `${pointer}: ${value} → ${after}`,
              changes: [{ pointer, before: value, after }],
            },
          ];
    }),
  );
  return withShifts(document, proposals);
}

/** The knots and profile points a line keeps without needing: those whose removal moves nothing beyond `tolerance`. */
const KNOTS: readonly CourseElementKind[] = ['boundary-knot', 'strip-knot', 'wall-strip-knot', 'pvi'];

/**
 * Middle knots (of Boundaries, Strips and wall Strips) and PVIs whose removal leaves every resolved line, wall height
 * and the road height within `tolerance` (0: exactly the same). Each is removed alone to measure it; the first and last
 * knots bound their line and stay.
 */
export function unneededKnotCandidates(
  document: Json,
  options: { readonly tolerance: number; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  const proposals = scoped(document, options.scope ?? {}).flatMap(({ element }) => {
    if (!KNOTS.includes(element.kind) || element.copies.some((copy) => copy.index > 0)) return [];
    const at = element.pointer.lastIndexOf('/');
    const list = valueAt(document, element.pointer.slice(0, at));
    // The first and last knots bound the line's extent; a middle one alone can be unneeded.
    const index = Number(element.pointer.slice(at + 1));
    if (!Array.isArray(list) || index === 0 || index === list.length - 1) return [];
    const before = valueAt(document, element.pointer);
    return [
      {
        id: `remove ${element.pointer}`,
        operation: 'remove-knot',
        pointer: element.pointer,
        description: `${element.pointer}: ${element.kind} not needed`,
        changes: [{ pointer: element.pointer, before, after: undefined }],
      },
    ];
  });
  return withShifts(document, proposals).filter((candidate) => candidate.shift <= options.tolerance);
}

/** Kinds whose Positions join with near ones: knots, wall and curb ends, open limits and gates. */
const JOINED: readonly CourseElementKind[] = [
  'boundary-knot',
  'strip-knot',
  'wall-strip-knot',
  'wall',
  'curb',
  'open-limit',
  'gate',
];

/**
 * Near things that could be one, each within `tolerance` (metres) but not the same: an absolute lateral near a
 * Boundary at an offset already used with it (or 0) becomes that reference; a Position near another element's Position
 * takes it (either way round, two candidates); a Position near a PI's station is measured from that PI with offset 0;
 * a Strip edge near the next Strip's edge at the same knot station takes the earlier one's written value. A join that
 * leaves the Section unreadable is not proposed.
 */
export function joinCandidates(
  document: Json,
  options: { readonly tolerance: number; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  const tolerance = options.tolerance;
  const near = (d: number) => d !== 0 && Math.abs(d) <= tolerance;
  const elements = scoped(document, options.scope ?? {});
  const proposals: Omit<CleaningCandidate, 'shift'>[] = [];
  const sections = readCourseStructure(document).sections;
  for (const [index, section] of sections.entries()) {
    const own = elements.filter((e) => e.index === index).map((e) => e.element);
    const boundaries = section.elements.filter((e) => e.kind === 'boundary' && e.lines.line);
    // Offsets each Boundary is already referred to with.
    const used = new Map<string, Set<number>>();
    for (const e of section.elements)
      for (const lateral of Object.values(e.laterals))
        if (lateral.form === 'reference')
          used.set(lateral.boundary, (used.get(lateral.boundary) ?? new Set([0])).add(lateral.offset));
    for (const element of own)
      for (const [field, lateral] of Object.entries(element.laterals)) {
        if (lateral.form !== 'absolute' || element.s === null) continue;
        let best: { boundary: string; offset: number; d: number } | null = null;
        for (const boundary of boundaries) {
          if (element.pointer.startsWith(`${boundary.pointer}/`)) continue;
          const at = lineAt(boundary.lines.line!, element.s);
          if (at === null) continue;
          for (const offset of used.get(String(boundary.values.id)) ?? [0]) {
            const d = lateral.value - (at + offset);
            if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.d)))
              best = { boundary: String(boundary.values.id), offset, d };
          }
        }
        if (best)
          proposals.push({
            id: `join ${element.pointer}/${field}`,
            operation: 'join-lateral',
            pointer: element.pointer,
            description: `${element.pointer}/${field}: ${lateral.value} → Boundary ${best.boundary} ${best.offset >= 0 ? '+' : ''}${best.offset} (${best.d.toFixed(3)} m away)`,
            changes: [
              {
                pointer: `${element.pointer}/${field}`,
                before: lateral.value,
                after: { boundary: best.boundary, offset: best.offset },
              },
            ],
          });
      }
    // Positions, in station order: neighbours of different elements, and PI stations.
    const positions = own
      .filter((e) => JOINED.includes(e.kind) && !e.copies.some((c) => c.index > 0))
      .flatMap((e) =>
        Object.entries(e.positions).flatMap(([field, p]) =>
          p.s === null ? [] : [{ element: e, field, pointer: `${e.pointer}/${field}`, s: p.s }],
        ),
      )
      .sort((a, b) => a.s - b.s);
    const parentOf = (pointer: string) => pointer.replace(/\/knots\/\d+$/, '');
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length && positions[j]!.s - positions[i]!.s <= tolerance; j++) {
        const a = positions[i]!,
          b = positions[j]!;
        if (!near(b.s - a.s) || parentOf(a.element.pointer) === parentOf(b.element.pointer)) continue;
        for (const [from, to] of [
          [a, b],
          [b, a],
        ] as const)
          proposals.push({
            id: `join ${from.pointer} to ${to.pointer}`,
            operation: 'join-position',
            pointer: from.element.pointer,
            description: `${from.pointer} takes ${to.pointer} (${Math.abs(b.s - a.s).toFixed(3)} m apart)`,
            changes: [
              { pointer: from.pointer, before: valueAt(document, from.pointer), after: valueAt(document, to.pointer) },
            ],
          });
      }
    const stations = section.elements.filter((e) => e.kind === 'pi' && e.s !== null);
    for (const p of positions)
      for (const pi of stations)
        if (near(p.s - pi.s!))
          proposals.push({
            id: `join ${p.pointer} to PI ${String(pi.values.id)}`,
            operation: 'join-pi',
            pointer: p.element.pointer,
            description: `${p.pointer} → PI ${String(pi.values.id)} + 0 (${Math.abs(p.s - pi.s!).toFixed(3)} m away)`,
            changes: [
              {
                pointer: p.pointer,
                before: valueAt(document, p.pointer),
                after: { pi: String(pi.values.id), offset: 0 },
              },
            ],
          });
    // Strip edges at one knot station: the later Strip's left takes the earlier's right when they nearly meet.
    const knots = own.filter((e) => e.kind === 'strip-knot' && !e.copies.some((c) => c.index > 0) && e.s !== null);
    for (const a of knots)
      for (const b of knots) {
        if (a.s !== b.s || parentOf(a.pointer) >= parentOf(b.pointer)) continue;
        const right = a.laterals.right,
          left = b.laterals.left;
        if (!right || !left || right.l === null || left.l === null || !near(left.l - right.l)) continue;
        proposals.push({
          id: `join ${b.pointer}/left to ${a.pointer}/right`,
          operation: 'join-edge',
          pointer: b.pointer,
          description: `${b.pointer}/left takes ${a.pointer}/right (${Math.abs(left.l - right.l).toFixed(3)} m gap or overlap)`,
          changes: [
            {
              pointer: `${b.pointer}/left`,
              before: valueAt(document, `${b.pointer}/left`),
              after: valueAt(document, `${a.pointer}/right`),
            },
          ],
        });
      }
  }
  // A join that leaves the Section unreadable (a Boundary then referring to itself) is no join.
  return withShifts(document, proposals).filter((candidate) => Number.isFinite(candidate.shift));
}

/** Every RGB555 `color` written in the document with its Pointer. */
function colorsOf(value: Json | undefined, pointer = '', found: { pointer: string; color: number }[] = []) {
  if (Array.isArray(value)) value.forEach((item, i) => colorsOf(item, `${pointer}/${i}`, found));
  else if (value !== null && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      if (key === 'color' && typeof item === 'number') found.push({ pointer: `${pointer}/${key}`, color: item });
      else colorsOf(item, `${pointer}/${key}`, found);
  return found;
}

/** The largest difference of two RGB555 colours' 5-bit components. */
const colorDistance = (a: number, b: number) =>
  Math.max(...[0, 5, 10].map((shift) => Math.abs(((a >> shift) & 31) - ((b >> shift) & 31))));

/**
 * Equal things that could be written once: each list's runs of three or more elements that combine exactly into a
 * repeat (one candidate per list), and colours within `colorTolerance` (5-bit steps) of a more used colour, which then
 * takes its place everywhere.
 */
export function mergeCandidates(
  document: Json,
  options: { readonly colorTolerance: number; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  const proposals: Omit<CleaningCandidate, 'shift'>[] = [];
  const lists = new Set(
    scoped(document, options.scope ?? {})
      .filter(({ element }) => !element.copies.length && !/knot|vertex|pi|arc-end|pvi|curve-end/.test(element.kind))
      .map(({ element }) => element.pointer.slice(0, element.pointer.lastIndexOf('/'))),
  );
  for (const parent of lists) {
    const list = valueAt(document, parent);
    if (!Array.isArray(list)) continue;
    let next: Json = document;
    let runs = 0;
    // Longest exact runs from the end, so earlier indexes stay valid as runs collapse.
    for (let end = list.length; end >= 3;) {
      let start = end - 3;
      const combines = (from: number) =>
        combineCourseElements(
          next,
          Array.from({ length: end - from }, (_, k) => `${parent}/${from + k}`),
        );
      if (!combines(start).ok) {
        end--;
        continue;
      }
      while (start > 0 && combines(start - 1).ok) start--;
      const result = combines(start);
      if (result.ok) {
        next = result.document;
        runs++;
      }
      end = start;
    }
    if (runs)
      proposals.push({
        id: `combine ${parent}`,
        operation: 'combine',
        pointer: parent,
        description: `${parent}: ${runs} run${runs === 1 ? '' : 's'} of equal elements combine into repeats`,
        changes: [{ pointer: parent, before: list, after: valueAt(next, parent) }],
      });
  }
  // Colours: each near a more used one takes it.
  const colors = colorsOf(document).filter(
    (c) => !options.scope?.section || c.pointer.startsWith(sectionPointer(document, options.scope.section)),
  );
  const counts = new Map<number, number>();
  for (const { color } of colors) counts.set(color, (counts.get(color) ?? 0) + 1);
  for (const [color, count] of counts) {
    const target = [...counts]
      .filter(
        ([other, n]) =>
          other !== color &&
          (n > count || (n === count && other < color)) &&
          colorDistance(color, other) <= options.colorTolerance,
      )
      .sort((a, b) => b[1] - a[1])[0];
    if (!target) continue;
    proposals.push({
      id: `color ${color} to ${target[0]}`,
      operation: 'merge-color',
      pointer: colors.find((c) => c.color === color)!.pointer,
      description: `color ${color} (${count} uses) → ${target[0]} (${target[1]} uses)`,
      changes: colors
        .filter((c) => c.color === color)
        .map((c) => ({ pointer: c.pointer, before: color, after: target[0] })),
    });
  }
  return withShifts(document, proposals);
}

/** A Section's Pointer by its id, or a Pointer nothing starts with. */
function sectionPointer(document: Json, id: string) {
  const sections = valueAt(document, '/sections');
  const index = Array.isArray(sections) ? sections.findIndex((s) => (s as { id?: Json })?.id === id) : -1;
  return index >= 0 ? `/sections/${index}/` : '\u0000';
}

/**
 * What is written alike, shown and not changed: the colours with their uses, references to a Boundary at the same
 * offset, and absolute laterals of the same value, each with its count.
 */
export function sameValueGroups(document: Json) {
  const colors = new Map<number, number>();
  for (const { color } of colorsOf(document)) colors.set(color, (colors.get(color) ?? 0) + 1);
  const references = new Map<string, number>(),
    absolutes = new Map<number, number>();
  for (const { element } of scoped(document, {}))
    for (const lateral of Object.values(element.laterals))
      if (lateral.form === 'reference') {
        const key = `${lateral.boundary} ${lateral.offset}`;
        references.set(key, (references.get(key) ?? 0) + 1);
      } else absolutes.set(lateral.value, (absolutes.get(lateral.value) ?? 0) + 1);
  const sorted = <K>(map: Map<K, number>) => [...map].sort((a, b) => b[1] - a[1]);
  return {
    colors: sorted(colors).map(([color, count]) => ({ color, count })),
    references: sorted(references).map(([key, count]) => {
      const at = key.lastIndexOf(' ');
      return { boundary: key.slice(0, at), offset: Number(key.slice(at + 1)), count };
    }),
    absolutes: sorted(absolutes).map(([value, count]) => ({ value, count })),
  };
}
