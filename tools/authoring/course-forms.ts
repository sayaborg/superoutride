import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { SectionDocument } from '../../src/course/course-document.js';
import type { CourseChange } from './course-edits.js';
import { createSectionPlan, readCourseSection, type ResolvedLine, type SectionStructure } from './course-structure.js';
import { valueAt, withValue, type Json } from './json-pointer.js';
import { computedValue, withNormalizedPositions } from './course-joints.js';

/**
 * An operation that changes how part of a course is written, always one an author chooses: the new document, each
 * changed value, and how far any resolved point or line of the Section moves (`shift`, metres; 0 when the course
 * resolves the same), or why it cannot be made.
 */
export type CourseFormResult =
  | {
      readonly ok: true;
      readonly document: Json;
      readonly changes: readonly CourseChange[];
      readonly shift: number;
    }
  | { readonly ok: false; readonly reason: string };

type JsonRecord = { [key: string]: Json };
const isRecord = (value: Json | undefined): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPosition = (value: Json | undefined): value is { joint: string; offset: number } =>
  isRecord(value) &&
  typeof value.joint === 'string' &&
  typeof value.offset === 'number' &&
  Object.keys(value).length === 2;
const isRepeat = (value: Json | undefined): value is JsonRecord & { every: number; count: number; elements: Json[] } =>
  isRecord(value) &&
  value.kind === 'repeat' &&
  typeof value.every === 'number' &&
  typeof value.count === 'number' &&
  Array.isArray(value.elements);

/** Every Position in a value moved `ds` along its Section, as a repeat's copy is (`offset` + ds, the joint kept). */
function shiftedPositions(value: Json, ds: number): Json {
  if (ds === 0) return value;
  if (isPosition(value)) return { joint: value.joint, offset: value.offset + ds };
  if (Array.isArray(value)) return value.map((item) => shiftedPositions(item, ds));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftedPositions(v, ds)]));
  return value;
}

/** A value's Positions' offsets in document order, and the value with each offset 0: what else it is. */
function positionsOf(value: Json): { offsets: number[]; rest: string } {
  const offsets: number[] = [];
  const strip = (v: Json): Json => {
    if (isPosition(v)) {
      offsets.push(v.offset);
      return { joint: v.joint, offset: 0 };
    }
    if (Array.isArray(v)) return v.map(strip);
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, strip(item)]));
    return v;
  };
  return { offsets, rest: JSON.stringify(strip(value)) };
}

/** The Section a Pointer is in: its index and Pointer. */
function sectionOf(pointer: string) {
  const match = /^\/sections\/(0|[1-9][0-9]*)(?=\/|$)/.exec(pointer);
  return match ? { index: Number(match[1]), pointer: match[0] } : null;
}

/** The parent array and index of an array item's Pointer. */
function itemOf(document: Json, pointer: string) {
  const at = pointer.lastIndexOf('/');
  const parent = pointer.slice(0, at),
    index = pointer.slice(at + 1);
  const list = valueAt(document, parent);
  return Array.isArray(list) && /^(0|[1-9][0-9]*)$/.test(index) && Number(index) < list.length
    ? { parent, list, index: Number(index) }
    : null;
}

/** A line's lateral at `s` by the course's own interpolation, or null outside it. */
function lineAt(line: ResolvedLine, s: number): number | null {
  if (line.length < 2 || s < line[0]!.s || s > line.at(-1)!.s)
    return line.length === 1 && s === line[0]!.s ? line[0]!.l : null;
  return courseBoundaryAt({ id: '', vertices: line.map((v) => ({ at: { s: v.s }, l: v.l })) }, s);
}

/** The greatest lateral difference of two lines where both exist, at either's vertices. */
function lineShift(a: ResolvedLine, b: ResolvedLine): number {
  let shift = 0;
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
 * How far a Section's resolved elements move from one reading to another, pair by pair in their order (repeats as
 * expanded): plan points, stations where there is no plan point, heights of the profile and resolved lines. Null when
 * the readings do not pair up (an element is added or removed).
 */
export function sectionShift(before: SectionStructure, after: SectionStructure): number | null {
  const leaves = (s: SectionStructure) => s.elements.filter((e) => e.kind !== 'repeat');
  const a = leaves(before),
    b = leaves(after);
  if (a.length !== b.length || a.some((e, i) => e.kind !== b[i]!.kind)) return null;
  let shift = 0;
  a.forEach((e, i) => {
    const f = b[i]!;
    if (e.x !== null && f.x !== null) shift = Math.max(shift, Math.hypot(e.x - f.x, e.z! - f.z!));
    else if (e.s !== null && f.s !== null) shift = Math.max(shift, Math.abs(e.s - f.s));
    if (e.y !== null && f.y !== null) shift = Math.max(shift, Math.abs(e.y - f.y));
    for (const [key, line] of Object.entries(e.lines)) {
      const other = f.lines[key];
      if (other) shift = Math.max(shift, lineShift(line, other));
    }
  });
  return shift;
}

/**
 * A form result whose shift is measured, the Section read before and after, with its Positions measured from their
 * nearest joints.
 */
function measured(document: Json, edited: Json, section: number, edits: CourseChange[]): CourseFormResult {
  const { document: next, changes } = withNormalizedPositions(document, edited, edits);
  const shift = sectionShift(
    readCourseSection(document, section).structure,
    readCourseSection(next, section).structure,
  );
  if (shift === null) throw new Error('A form operation must keep its Section readings paired');
  return { ok: true, document: next, changes, shift };
}

/**
 * Explode a repeat into the single elements it stands for, in place: each copy is the repeat's elements with every
 * Position moved by its index × `every`, as the course expands it. A repeat inside becomes `count` repeats, one level at
 * a time.
 */
export function explodeCourseRepeat(document: Json, pointer: string): CourseFormResult {
  const repeat = valueAt(document, pointer);
  const item = itemOf(document, pointer);
  const section = sectionOf(pointer);
  if (!isRepeat(repeat) || !item || !section) return { ok: false, reason: `${pointer} is not a repeat` };
  const copies = Array.from({ length: repeat.count }, (_, k) =>
    repeat.elements.map((element) => shiftedPositions(element, k * repeat.every)),
  ).flat();
  const next = withValue(document, item.parent, [
    ...item.list.slice(0, item.index),
    ...copies,
    ...item.list.slice(item.index + 1),
  ]);
  return measured(document, next, section.index, [
    { pointer, before: repeat, after: undefined },
    ...copies.map((copy, i) => ({ pointer: `${item.parent}/${item.index + i}`, before: undefined, after: copy })),
  ]);
}

/**
 * Combine elements of one list into a repeat. They must be a block repeated at one spacing: one element (taken in station
 * order) or several (taken in list order), each copy the same but for its Positions, which step by `every`. The repeat
 * holds the first block and takes the place of the first element in the list. With a tolerance, steps within it are
 * evened out and the largest move is the shift; with 0, only exact steps combine.
 */
export function combineCourseElements(document: Json, pointers: readonly string[], tolerance = 0): CourseFormResult {
  if (pointers.length < 2) return { ok: false, reason: 'Combine needs at least two elements' };
  if (!(tolerance >= 0)) return { ok: false, reason: 'The tolerance must be 0 or more' };
  const items = pointers.map((pointer) => itemOf(document, pointer));
  const parent = items[0]?.parent;
  if (!sectionOf(pointers[0]!) || items.some((item) => !item || item.parent !== parent))
    return { ok: false, reason: 'Combine needs elements of one list' };
  if (new Set(pointers).size !== pointers.length) return { ok: false, reason: 'An element is chosen twice' };
  const list = items[0]!.list;
  const listed = items
    .map((item) => ({ index: item!.index, value: list[item!.index]!, ...positionsOf(list[item!.index]!) }))
    .sort((a, b) => a.index - b.index);
  if (listed.some((r) => !r.offsets.length)) return { ok: false, reason: 'Every element needs a Position' };
  const byStation = [...listed].sort((a, b) => a.offsets[0]! - b.offsets[0]!);
  // The shortest block that repeats: copy k of block element j is element j moved k × every.
  const count = listed.length;
  let best: { block: typeof listed; copies: number; every: number; shift: number } | null = null;
  for (let size = 1; size < count && !best; size++) {
    if (count % size) continue;
    const records = size === 1 ? byStation : listed;
    const block = records.slice(0, size);
    if (records.some((r, i) => r.rest !== block[i % size]!.rest)) continue;
    const copies = count / size;
    // How far the copies stray from even steps of `every`: with no tolerance, only exact steps count.
    const deviation = (every: number) => {
      let most = 0;
      records.forEach((record, i) =>
        record.offsets.forEach((offset, j) => {
          const expected = block[i % size]!.offsets[j]! + Math.floor(i / size) * every;
          most = Math.max(most, tolerance === 0 ? (offset === expected ? 0 : Infinity) : Math.abs(offset - expected));
        }),
      );
      return most;
    };
    // The spacing: the first step as written (its floating-point noise dropped), or the mean step.
    const step = records[size]!.offsets[0]! - block[0]!.offsets[0]!,
      mean = (records[count - size]!.offsets[0]! - block[0]!.offsets[0]!) / (copies - 1);
    const every = [Number(step.toPrecision(12)), step, computedValue(mean), mean].reduce((a, b) =>
      deviation(b) < deviation(a) ? b : a,
    );
    const shift = deviation(every);
    if (every > 0 && shift <= tolerance) best = { block, copies, every, shift };
  }
  if (!best)
    return {
      ok: false,
      reason:
        tolerance === 0
          ? 'The elements are not one block repeated exactly at one spacing'
          : 'The elements are not one block repeated at one spacing within the tolerance',
    };
  const repeat = { kind: 'repeat', every: best.every, count: best.copies, elements: best.block.map((r) => r.value) };
  const at = listed[0]!.index;
  const chosen = new Set(listed.map((r) => r.index));
  const next = withValue(
    document,
    parent!,
    list.flatMap((value, i) => (i === at ? [repeat] : chosen.has(i) ? [] : [value])),
  );
  // The shift is the evening out: the elements may have been listed in another order than their stations.
  return {
    ok: true,
    document: next,
    changes: [
      ...listed.map((r) => ({ pointer: `${parent}/${r.index}`, before: r.value, after: undefined })),
      { pointer: `${parent}/${at}`, before: undefined, after: repeat },
    ],
    shift: best.shift,
  };
}

/** The element at a Pointer in a Section's reading, its first copy when repeated. */
function elementAt(document: Json, pointer: string) {
  const section = sectionOf(pointer);
  if (!section) return null;
  const read = readCourseSection(document, section.index);
  const element = read.structure.elements.find((e) => e.pointer === pointer && e.point === 'authored');
  return element ? { section, read, element } : null;
}

/**
 * Bind an absolute lateral to a Boundary: it becomes a reference whose offset gives the same lateral at the element's
 * station. Between knots, a bound line follows the Boundary instead of running straight: that is the shift.
 */
export function bindCourseLateral(document: Json, pointer: string, field: string, boundary: string): CourseFormResult {
  const found = elementAt(document, pointer);
  const lateral = found?.element.laterals[field];
  if (!found || !lateral) return { ok: false, reason: `${pointer} has no lateral ${field}` };
  if (lateral.form !== 'absolute') return { ok: false, reason: `${pointer}/${field} is already a reference` };
  const target = found.read.structure.elements.find((e) => e.kind === 'boundary' && e.values.id === boundary);
  if (!target) return { ok: false, reason: `No Boundary ${boundary} in this Section` };
  if (pointer.startsWith(`${target.pointer}/`)) return { ok: false, reason: 'A Boundary cannot refer to itself' };
  const s = found.element.s;
  const at = s === null || !target.lines.line ? null : lineAt(target.lines.line, s);
  if (at === null) return { ok: false, reason: `Boundary ${boundary} does not reach the element's station` };
  const after = { boundary, offset: computedValue(lateral.value - at) };
  const next = withValue(document, `${pointer}/${field}`, after);
  return measured(document, next, found.section.index, [
    { pointer: `${pointer}/${field}`, before: lateral.value, after },
  ]);
}

/**
 * Unbind a reference lateral: it becomes the absolute number it resolves to at the element's station. Between knots, a
 * line that followed its Boundary then runs straight: that is the shift.
 */
export function unbindCourseLateral(document: Json, pointer: string, field: string): CourseFormResult {
  const found = elementAt(document, pointer);
  const lateral = found?.element.laterals[field];
  if (!found || !lateral) return { ok: false, reason: `${pointer} has no lateral ${field}` };
  if (lateral.form !== 'reference') return { ok: false, reason: `${pointer}/${field} is already absolute` };
  if (lateral.l === null) return { ok: false, reason: `${pointer}/${field} does not resolve` };
  const before = valueAt(document, `${pointer}/${field}`);
  const after = computedValue(lateral.l);
  const next = withValue(document, `${pointer}/${field}`, after);
  return measured(document, next, found.section.index, [{ pointer: `${pointer}/${field}`, before, after }]);
}

/** Measure a Position from another joint: its offset is chosen so the station stays where it is. */
export function reanchorCoursePosition(document: Json, pointer: string, joint: string): CourseFormResult {
  const position = valueAt(document, pointer);
  const section = sectionOf(pointer);
  if (!isPosition(position) || !section) return { ok: false, reason: `${pointer} is not a Position` };
  const plan = createSectionPlan(
    valueAt(document, section.pointer) as unknown as SectionDocument,
    section.pointer,
  ).plan;
  const from = plan?.stations.get(position.joint),
    to = plan?.stations.get(joint);
  if (from === undefined || to === undefined)
    return { ok: false, reason: plan ? `No joint ${joint} in this Section` : 'The Section plan does not compile' };
  const after = { joint, offset: computedValue(position.offset + from - to) };
  const next = withValue(document, pointer, after);
  return measured(document, next, section.index, [{ pointer, before: position, after }]);
}
