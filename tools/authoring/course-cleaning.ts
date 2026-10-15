import { snapCourseValue, type CourseChange } from './course-edits.js';
import { combineCourseElements, readShift, sectionShift } from './course-forms.js';
import {
  readCourseSection,
  readCourseStructure,
  lateralLineName,
  referableLines,
  type CourseElement,
  type CourseElementKind,
  type ResolvedLine,
  type SectionPlan,
} from './course-structure.js';
import { valueAt, withValue, type Json } from './json-pointer.js';
import type { ProfileReader } from '../../src/course/geometry/profile.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { SECTION_END_JOINT } from '../../src/course/course-document.js';
import { withNormalizedPositions } from './course-joints.js';

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

/** A candidate before its shift is measured: what an operation proposes, from which its shift is measured. */
export type CleaningProposal = Omit<CleaningCandidate, 'shift'>;

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
function scoped(document: Json, scope: CleaningScope, structure = readCourseStructure(document)) {
  const seen = new Set<string>();
  return structure.sections.flatMap((section, index) =>
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

/**
 * Whether two plans are the same ruler on the same ground: the same length and joint stations, and the same centreline.
 * A radius or a turn changes the centreline while it keeps the lengths.
 */
function samePlan(a: SectionPlan | null, b: SectionPlan | null) {
  if (!a || !b) return a === b;
  return (
    a.length === b.length &&
    [...a.stations].every(([joint, s]) => b.stations.get(joint) === s) &&
    centrelineShift(a, b) === 0
  );
}

/**
 * The stations a change can move anything at, as `[from, to]`: a candidate that changes the plan or whose reach is not
 * one interval has none (null), and is compared over its whole Section.
 */
type Reach = readonly [number, number];

/** The greatest height difference of two profiles, sampled every 2 m over both, or those samples within `reach`. */
function profileShift(a: ProfileReader | null, b: ProfileReader | null, length: number, reach: Reach | null = null) {
  if (!a || !b) return a === b ? 0 : Infinity;
  const [from, to] = reach ?? [0, length];
  let shift = 0;
  // The same 2 m samples, those within the reach.
  for (let s = Math.max(0, Math.ceil(from / 2) * 2); s <= Math.min(length, to); s += 2)
    shift = Math.max(shift, Math.abs(a.sample(s) - b.sample(s)));
  return shift;
}

/**
 * Each wall Strip's `bottom` and `top` along s, from its knots (the same repetition), as lines of heights: one pass over
 * the Section's elements, kept with its reading, since every candidate compares against the same reading before it.
 */
const wallHeightsOf = new WeakMap<Reading, Map<string, Record<'bottom' | 'top', ResolvedLine>>>();
function wallHeights(reading: Reading) {
  const known = wallHeightsOf.get(reading);
  if (known) return known;
  const copy = (e: CourseElement) => e.copies.map((c) => c.index).join(',');
  const heights = new Map<string, Record<'bottom' | 'top', ResolvedLine>>();
  for (const strip of reading.structure.elements)
    if (strip.kind === 'wall-strip') heights.set(`${strip.pointer} ${copy(strip)}`, { bottom: [], top: [] });
  for (const knot of reading.structure.elements) {
    if (knot.kind !== 'wall-strip-knot' || knot.s === null) continue;
    const strip = heights.get(`${knot.pointer.slice(0, knot.pointer.lastIndexOf('/knots/'))} ${copy(knot)}`);
    if (!strip) continue;
    for (const key of ['bottom', 'top'] as const)
      (strip[key] as ResolvedLine[number][]).push({ s: knot.s, l: Number(knot.values[key]), authored: true });
  }
  wallHeightsOf.set(reading, heights);
  return heights;
}

/**
 * The greatest lateral (or height) difference of two lines along the same ruler, at either's vertices; a line that
 * starts or ends elsewhere moves by at least that distance.
 */
function lineShift(a: ResolvedLine, b: ResolvedLine, reach: Reach | null = null) {
  if (!a.length || !b.length) return a.length === b.length ? 0 : Infinity;
  let shift = Math.max(Math.abs(a[0]!.s - b[0]!.s), Math.abs(a.at(-1)!.s - b.at(-1)!.s));
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const)
    for (const vertex of from) {
      if (reach && (vertex.s < reach[0] || vertex.s > reach[1])) continue;
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
function readingShift(before: Reading, after: Reading, reach: Reach | null = null): number {
  if (!before.plan || !after.plan) return before.plan === after.plan ? 0 : Infinity;
  // A change with a reach leaves the plan as it is.
  const same = reach !== null || samePlan(before.plan, after.plan);
  const key = (e: CourseElement) => `${e.kind} ${e.pointer} ${e.copies.map((c) => c.index).join(',')}`;
  const later = new Map<string, CourseElement[]>();
  for (const e of after.structure.elements) later.set(key(e), [...(later.get(key(e)) ?? []), e]);
  let shift = profileShift(before.profile, after.profile, Math.min(before.plan.length, after.plan.length), reach);
  const counts = new Map<string, number>();
  for (const e of before.structure.elements) {
    const n = counts.get(key(e)) ?? 0;
    counts.set(key(e), n + 1);
    const f = later.get(key(e))?.[n];
    if (!f) {
      // A removed knot, or a later sibling renumbered by it, is measured through its element's lines, and a PVI through
      // the profile.
      if (/knot|vertex|pvi|curve-end/.test(e.kind)) continue;
      return Infinity;
    }
    // Points written in sequences (knots, vertices, PVIs) pair by number, not by what they resolve to; their lines and
    // the profile measure them.
    if (!/knot|vertex|pvi|curve-end/.test(e.kind) && e.x !== null && f.x !== null)
      shift = Math.max(shift, Math.hypot(e.x - f.x, e.z! - f.z!));
    for (const [name, line] of Object.entries(e.lines)) {
      const other = f.lines[name];
      if (!other) return Infinity;
      if (same) shift = Math.max(shift, lineShift(line, other, reach));
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
      if (same) shift = Math.max(shift, lineShift(heights[key], other[key], reach));
      else if (heights[key].length === other[key].length)
        heights[key].forEach((v, i) => (shift = Math.max(shift, Math.abs(v.l - other[key][i]!.l))));
      else return Infinity;
  }
  return shift;
}

/** A Section's move between readings: paired by element, else (when elements were renumbered) in order. */
function shiftBetween(before: Reading, after: Reading, reach: Reach | null = null) {
  const paired = readingShift(before, after, reach);
  if (Number.isFinite(paired) || !samePlan(before.plan, after.plan)) return readShift(paired);
  return readShift(sectionShift(before.structure, after.structure) ?? Infinity);
}

/** The largest distance from the old centreline, sampled every 2 m, to the new one. */
function centrelineShift(before: SectionPlan | null, after: SectionPlan | null) {
  if (!before || !after) return before === after ? 0 : Infinity;
  let shift = 0;
  for (let s = 0; s <= before.length; s += 2) {
    const p = before.toWorld(s, 0);
    shift = Math.max(shift, Math.abs(after.nearest(p.x, p.z).l));
  }
  return readShift(shift);
}

/** The Section index a Pointer is in. */
const sectionIndexOf = (pointer: string) => Number(/^\/sections\/(\d+)/.exec(pointer)?.[1] ?? -1);

/**
 * Candidates with their shift: each applied alone to the document and its Section read again, and compared over its
 * reach when it has one. A Section compiles as one unit (its plan, joints, Positions measured from joints and Strip
 * slabs), so it is read again whole.
 */
export function withShifts(
  document: Json,
  proposals: readonly (CleaningProposal & { readonly reach?: Reach | null })[],
): CleaningCandidate[] {
  const readings = new Map<number, Reading>();
  const before = (index: number) => {
    if (!readings.has(index)) readings.set(index, readCourseSection(document, index));
    return readings.get(index)!;
  };
  return proposals.map(({ reach, ...proposal }) => {
    const index = sectionIndexOf(proposal.pointer);
    const after = readCourseSection(applyCourseChanges(document, proposal.changes), index);
    return { ...proposal, shift: shiftBetween(before(index), after, reach ?? null) };
  });
}

/**
 * Apply chosen candidates as one edit: the new document, every change, the largest move of anything the changed
 * Sections resolve, and each changed Section's centreline shift and length change.
 */
export function applyCleaning(document: Json, candidates: readonly CleaningCandidate[]): CleaningResult {
  const edits = candidates.flatMap((candidate) => candidate.changes);
  const { document: next, changes } = withNormalizedPositions(document, applyCourseChanges(document, edits), edits);
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
export const ROUNDED_VALUES = [
  'length',
  'radius',
  'offset',
  'lateral',
  'width',
  'height',
  'curveLength',
  'every',
] as const;
export type RoundedValue = (typeof ROUNDED_VALUES)[number];

/** An element's written numbers of the named kinds, each with its Pointer. */
function roundable(element: CourseElement, document: Json, values: readonly RoundedValue[]) {
  const found: { pointer: string; value: number }[] = [];
  const add = (pointer: string) => {
    const value = valueAt(document, pointer);
    if (typeof value === 'number') found.push({ pointer, value });
  };
  if (element.kind === 'plan') {
    if (values.includes('length')) add(`${element.pointer}/length`);
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
  // A lane's or median's width: its number, or each value of a width written at Positions.
  if (
    (element.kind === 'lane' || element.kind === 'median' || element.kind === 'width-knot') &&
    values.includes('width')
  )
    add(`${element.pointer}/width`);
  return found;
}

/** Round written numbers of the chosen kinds to a step: each value off the step is a candidate. */
export function roundCandidates(
  document: Json,
  options: { readonly step: number; readonly values: readonly RoundedValue[]; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  return withShifts(document, offStepValues(document, options));
}

/** The written numbers of the chosen kinds off a step, each with its rounded value: round's proposals, unmeasured. */
export function offStepValues(
  document: Json,
  options: { readonly step: number; readonly values: readonly RoundedValue[]; readonly scope?: CleaningScope },
): CleaningProposal[] {
  return scoped(document, options.scope ?? {}).flatMap(({ element }) =>
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
}

/** The knots and profile points a line keeps without needing: those whose removal moves nothing beyond `tolerance`. */
const KNOTS: readonly CourseElementKind[] = ['boundary-knot', 'wall-strip-knot', 'pvi'];

/**
 * Middle knots (of Boundaries, Strips and wall Strips) and PVIs whose removal leaves every resolved line, wall height
 * and the road height within `tolerance` (0: the same within the reading arithmetic, `readShift`). Each is removed alone to measure it; the first and last
 * knots bound their line and stay.
 */
export function unneededKnotCandidates(
  document: Json,
  options: { readonly tolerance: number; readonly scope?: CleaningScope },
): CleaningCandidate[] {
  const structure = readCourseStructure(document);
  const resolved = new Map(
    structure.sections.flatMap((section) =>
      section.elements.filter((e) => e.copies.length === 0).map((e) => [e.pointer, e] as const),
    ),
  );
  const proposals = scoped(document, options.scope ?? {}, structure).flatMap(({ element }) => {
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
        reach: knotReach(resolved, element, index),
      },
    ];
  });
  return withShifts(document, proposals).filter((candidate) => candidate.shift <= options.tolerance);
}

/**
 * The stations removing knot or PVI `index` can move anything at: between its neighbours (a line runs straight between
 * knots), and for a PVI out to its neighbours' vertical curves, whose grades it sets. None when the knot is repeated or a
 * neighbour does not resolve.
 */
function knotReach(resolved: ReadonlyMap<string, CourseElement>, element: CourseElement, index: number): Reach | null {
  if (element.copies.length) return null;
  const parent = element.pointer.slice(0, element.pointer.lastIndexOf('/'));
  const [previous, next] = [index - 1, index + 1].map((i) => resolved.get(`${parent}/${i}`));
  if (typeof previous?.s !== 'number' || typeof next?.s !== 'number') return null;
  const half = (e: CourseElement) => (element.kind === 'pvi' ? Number(e.values.curveLength ?? 0) / 2 : 0);
  return [previous.s - half(previous), next.s + half(next)];
}

/** Kinds whose Positions join with near ones: knots, Strip, wall and curb ends, open limits and gates. */
const JOINED: readonly CourseElementKind[] = [
  'boundary-knot',
  'strip',
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
    // The lines a lateral can refer to (Boundaries and lane lines), and the offsets each is already referred to with.
    const lines = referableLines(section);
    const used = new Map<string, Set<number>>();
    for (const e of section.elements)
      for (const lateral of Object.values(e.laterals))
        if (lateral.form !== 'absolute') {
          const name = lateralLineName(lateral);
          used.set(name, (used.get(name) ?? new Set([0])).add(lateral.offset));
        }
    for (const element of own)
      for (const [field, lateral] of Object.entries(element.laterals)) {
        if (lateral.form !== 'absolute' || element.s === null) continue;
        let best: { line: (typeof lines)[number]; offset: number; d: number } | null = null;
        for (const line of lines) {
          if ('boundary' in line.target && element.pointer.startsWith(`${line.pointer}/`)) continue;
          const at = lineAt(line.line, element.s);
          if (at === null) continue;
          for (const offset of used.get(line.name) ?? [0]) {
            const d = lateral.value - (at + offset);
            if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.d))) best = { line, offset, d };
          }
        }
        if (best)
          proposals.push({
            id: `join ${element.pointer}/${field}`,
            // Exactly on the Boundary's line: the reference writes the same lateral.
            operation: best.d === 0 ? 'join-reference' : 'join-lateral',
            pointer: element.pointer,
            description: `${element.pointer}/${field}: ${lateral.value} → ${best.line.name} ${best.offset >= 0 ? '+' : ''}${best.offset} (${best.d.toFixed(3)} m away)`,
            changes: [
              {
                pointer: `${element.pointer}/${field}`,
                before: lateral.value,
                after: { ...best.line.target, offset: best.offset },
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
    const joints = section.elements
      .filter((e) => (e.kind === 'plan' || e.kind === 'plan-end') && e.s !== null)
      .map((e) => ({ id: e.kind === 'plan' ? String(e.values.id) : SECTION_END_JOINT, s: e.s! }));
    for (const p of positions)
      for (const joint of joints)
        if (near(p.s - joint.s))
          proposals.push({
            id: `join ${p.pointer} to joint ${joint.id}`,
            operation: 'join-joint',
            pointer: p.element.pointer,
            description: `${p.pointer} → ${joint.id} + 0 (${Math.abs(p.s - joint.s).toFixed(3)} m away)`,
            changes: [
              {
                pointer: p.pointer,
                before: valueAt(document, p.pointer),
                after: { joint: joint.id, offset: 0 },
              },
            ],
          });
    // Strip edges: a later Strip's left takes an earlier one's right when they nearly meet where the later starts.
    const strips = own.filter((e) => e.kind === 'strip' && !e.copies.some((c) => c.index > 0) && e.s !== null);
    for (const a of strips)
      for (const b of strips) {
        if (a.pointer >= b.pointer || !a.lines.right || !b.lines.left) continue;
        const right = lineAt(a.lines.right, b.s!),
          left = lineAt(b.lines.left, b.s!);
        if (right === null || left === null || !near(left - right)) continue;
        proposals.push({
          id: `join ${b.pointer}/left to ${a.pointer}/right`,
          operation: 'join-edge',
          pointer: b.pointer,
          description: `${b.pointer}/left takes ${a.pointer}/right (${Math.abs(left - right).toFixed(3)} m gap or overlap)`,
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
  const scope = options.scope ?? {};
  const elements = scoped(document, scope);
  // Each list's items in scope, by index: a run combines items in scope alone, never a sibling outside it.
  const lists = new Map<string, Set<number>>();
  for (const { element } of elements)
    if (!element.copies.length && !/knot|vertex|plan|tangent|pvi|curve-end/.test(element.kind)) {
      const at = element.pointer.lastIndexOf('/');
      const parent = element.pointer.slice(0, at);
      lists.set(parent, (lists.get(parent) ?? new Set()).add(Number(element.pointer.slice(at + 1))));
    }
  // A width written at Positions whose values are all the same is that one number.
  for (const { element } of elements) {
    if (element.kind !== 'lane' && element.kind !== 'median') continue;
    const width = valueAt(document, `${element.pointer}/width`);
    if (!Array.isArray(width) || width.length < 2) continue;
    const values = width.map((knot) => (knot && typeof knot === 'object' && !Array.isArray(knot) ? knot.width : null));
    if (typeof values[0] === 'number' && values.every((value) => value === values[0]))
      proposals.push({
        id: `merge ${element.pointer}/width`,
        operation: 'merge-width',
        pointer: element.pointer,
        description: `${element.pointer}/width: ${width.length} values of ${values[0]} → ${values[0]}`,
        changes: [{ pointer: `${element.pointer}/width`, before: width, after: values[0] }],
      });
  }
  for (const [parent, inScope] of lists) {
    const list = valueAt(document, parent);
    if (!Array.isArray(list)) continue;
    let next: Json = document;
    let runs = 0;
    // Longest exact runs from the end, so earlier indexes stay valid as runs collapse.
    for (let end = list.length; end >= 3;) {
      let start = end - 3;
      // The run from `from` to `end` combined, when every item in it is in scope.
      const combined = (from: number) => {
        const items = Array.from({ length: end - from }, (_, k) => from + k);
        return items.every((index) => inScope.has(index))
          ? combineCourseElements(
              next,
              items.map((index) => `${parent}/${index}`),
            )
          : null;
      };
      if (!combined(start)?.ok) {
        end--;
        continue;
      }
      while (start > 0 && combined(start - 1)?.ok) start--;
      const result = combined(start)!;
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
  // Colours in scope: each near a more used one takes it. A Section's scope holds every colour written in it; elements or
  // kinds hold the colours written in those elements.
  const section = scope.section === undefined ? '' : sectionPointer(document, scope.section);
  const holders = elements.map(({ element }) => `${element.pointer}/`);
  const colors = colorsOf(document).filter(
    (c) =>
      c.pointer.startsWith(section) &&
      ((!scope.pointers && !scope.kinds) || holders.some((holder) => c.pointer.startsWith(holder))),
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
      } else if (lateral.form === 'absolute') absolutes.set(lateral.value, (absolutes.get(lateral.value) ?? 0) + 1);
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

/** One cleaning operation's search: what "Find candidates" asks for, sent off the page's thread as it is. */
export type CleaningRequest = { readonly scope: CleaningScope } & (
  | { readonly operation: 'round'; readonly step: number; readonly values: readonly RoundedValue[] }
  | { readonly operation: 'knots' | 'join'; readonly tolerance: number }
  | { readonly operation: 'merge'; readonly colorTolerance: number }
);

/** The candidates a cleaning request finds in a document. */
export function cleaningCandidates(document: Json, request: CleaningRequest): CleaningCandidate[] {
  switch (request.operation) {
    case 'round':
      return roundCandidates(document, request);
    case 'knots':
      return unneededKnotCandidates(document, request);
    case 'join':
      return joinCandidates(document, request);
    case 'merge':
      return mergeCandidates(document, request);
  }
}
