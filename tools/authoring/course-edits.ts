import { readCourseDocument } from '../../src/course/course-document.js';
import type { CourseElement } from './course-structure.js';
import { childPointer, valueAt, withValue, type Json } from './json-pointer.js';

/** One written value an edit changes: absent before when added, absent after when removed. */
export interface CourseChange {
  readonly pointer: string;
  readonly before: Json | undefined;
  readonly after: Json | undefined;
}

/** An edit's new document with the values it changed, or why it cannot be made. */
export type CourseEditResult =
  | { readonly ok: true; readonly document: Json; readonly changes: readonly CourseChange[] }
  | { readonly ok: false; readonly reason: string };

/**
 * A course document as it is saved: in the format's field order when it admits (the admitted value is the same data
 * in that order), else as written, so a draft that does not admit is still saved.
 */
export function savedCourseDocument(document: Json): Json {
  const admitted = readCourseDocument(document);
  return admitted.ok ? (admitted.value as unknown as Json) : document;
}

/** A value on the nearest multiple of `step`; unchanged without a step. */
export function snapCourseValue(value: number, step: number | null = null): number {
  if (step === null) return value;
  if (!(step > 0)) throw new RangeError('A snapping step must be positive');
  // The multiple, with the step's decimals, so 0.1-steps stay short in the saved document.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(Math.min(decimals, 12)));
}

/**
 * Written numbers set to new values: each Pointer must already hold a number, so an edit never changes how a value is
 * written (a reference stays a reference). The values are the document's; nothing is resolved or rewritten.
 */
export function setCourseNumbers(
  document: Json,
  values: readonly { readonly pointer: string; readonly value: number }[],
): CourseEditResult {
  let next = document;
  const changes: CourseChange[] = [];
  for (const { pointer, value } of values) {
    const before = valueAt(next, pointer);
    if (typeof before !== 'number') return { ok: false, reason: `${pointer || '/'} does not hold a written number` };
    if (!Number.isFinite(value)) return { ok: false, reason: `${pointer} must be a finite number` };
    if (before === value) continue;
    next = withValue(next, pointer, value);
    changes.push({ pointer, before, after: value });
  }
  return { ok: true, document: next, changes };
}

/**
 * An element moved `ds` along the Section and `dl` across it, as written: each Position's `offset` (its PI stays) and
 * each lateral's number, or a reference's `offset` (the reference stays). A repeat copy's record is its original's, so
 * moving a copy moves the original and every copy. `fields` limits the move to some of the element's Positions and
 * laterals (a wall's `from`, a Strip's `left`); `step` snaps each changed value.
 */
export function moveCourseElement(
  document: Json,
  element: CourseElement,
  move: {
    readonly ds?: number;
    readonly dl?: number;
    readonly fields?: readonly string[];
    readonly step?: number | null;
  },
): CourseEditResult {
  if (element.point === 'derived')
    return { ok: false, reason: `A derived ${element.kind} moves with ${element.derivedFrom ?? 'what it comes from'}` };
  const chosen = (field: string) => !move.fields || move.fields.includes(field);
  const values: { pointer: string; value: number }[] = [];
  if (move.ds)
    for (const [field, position] of Object.entries(element.positions))
      if (chosen(field))
        values.push({
          pointer: `${element.pointer}/${field}/offset`,
          value: snapCourseValue(position.offset + move.ds, move.step),
        });
  if (move.dl)
    for (const [field, lateral] of Object.entries(element.laterals))
      if (chosen(field))
        values.push(
          lateral.form === 'absolute'
            ? { pointer: `${element.pointer}/${field}`, value: snapCourseValue(lateral.value + move.dl, move.step) }
            : {
                pointer: `${element.pointer}/${field}/offset`,
                value: snapCourseValue(lateral.offset + move.dl, move.step),
              },
        );
  if (!values.length && (move.ds || move.dl))
    return { ok: false, reason: `${element.pointer} has no written Position or lateral to move` };
  return setCourseNumbers(document, values);
}

/** A plan element as an edit adds it: a straight, or an arc of a radius turning left or right. */
export type CoursePlanShape =
  | { readonly kind: 'straight'; readonly length: number }
  | { readonly kind: 'arc'; readonly length: number; readonly radius: number; readonly turn: 'left' | 'right' };

/** A new plan element inserted at `index` of a Section's plan, with an id the Section lacks. */
export function addCoursePlanElement(
  document: Json,
  section: string,
  index: number,
  shape: CoursePlanShape,
): CourseEditResult {
  const plan = valueAt(document, `${section}/plan`);
  if (!Array.isArray(plan)) return { ok: false, reason: `${section} has no plan` };
  if (!Number.isInteger(index) || index < 0 || index > plan.length)
    return { ok: false, reason: `A plan index must be 0 to ${plan.length}` };
  if (!(shape.length > 0) || (shape.kind === 'arc' && !(shape.radius > 0)))
    return { ok: false, reason: 'A plan element needs a positive length, and an arc a positive radius' };
  const ids = new Set(plan.map((e) => (e && typeof e === 'object' && !Array.isArray(e) ? e.id : null)));
  let n = plan.length;
  while (ids.has(`${shape.kind}-${String(n).padStart(2, '0')}`)) n++;
  const id = `${shape.kind}-${String(n).padStart(2, '0')}`;
  const element: Json =
    shape.kind === 'arc'
      ? { kind: 'arc', id, length: shape.length, radius: shape.radius, turn: shape.turn }
      : { kind: 'straight', id, length: shape.length };
  return {
    ok: true,
    document: withValue(document, `${section}/plan`, [...plan.slice(0, index), element, ...plan.slice(index)]),
    changes: [{ pointer: `${section}/plan/${index}`, before: undefined, after: element }],
  };
}

/** A plan element removed from its Section; refused while a Position in the Section measures from its joint. */
export function removeCoursePlanElement(document: Json, pointer: string): CourseEditResult {
  const match = /^(.*)\/plan\/(0|[1-9][0-9]*)$/.exec(pointer);
  const element = match ? valueAt(document, pointer) : undefined;
  if (!match || !element || typeof element !== 'object' || Array.isArray(element))
    return { ok: false, reason: `${pointer} is not a plan element` };
  const section = match[1]!;
  const users = positionsFrom(valueAt(document, section), section, element.id);
  if (users.length)
    return {
      ok: false,
      reason: `${users.length} Position${users.length === 1 ? '' : 's'} measure from ${String(element.id)}, first ${users[0]}; measure them from another joint first`,
    };
  const plan = valueAt(document, `${section}/plan`) as Json[];
  return {
    ok: true,
    document: withValue(
      document,
      `${section}/plan`,
      plan.filter((_, i) => i !== Number(match[2])),
    ),
    changes: [{ pointer, before: element, after: undefined }],
  };
}

/** The Pointers of the Positions under `value` measured from joint `id`. */
function positionsFrom(value: Json | undefined, pointer: string, id: Json | undefined): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  if (!Array.isArray(value) && value.joint === id && 'offset' in value) found.push(pointer);
  for (const [key, child] of Object.entries(value)) found.push(...positionsFrom(child, childPointer(pointer, key), id));
  return found;
}
