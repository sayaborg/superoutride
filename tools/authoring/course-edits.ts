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

/** A new PI at a plan point and radius, inserted at `index` of a Section's PIs, with an id the Section lacks. */
export function addCoursePi(
  document: Json,
  section: string,
  index: number,
  at: { readonly x: number; readonly z: number; readonly radius: number },
): CourseEditResult {
  const { x, z, radius } = at;
  const pis = valueAt(document, `${section}/pis`);
  if (!Array.isArray(pis)) return { ok: false, reason: `${section} has no PI list` };
  if (!Number.isInteger(index) || index < 0 || index > pis.length)
    return { ok: false, reason: `A PI index must be 0 to ${pis.length}` };
  if (![x, z, radius].every(Number.isFinite)) return { ok: false, reason: 'A PI needs a finite x, z and radius' };
  const ids = new Set(pis.map((pi) => (pi && typeof pi === 'object' && !Array.isArray(pi) ? pi.id : null)));
  let n = pis.length;
  while (ids.has(`pi-${String(n).padStart(2, '0')}`)) n++;
  const pi = { id: `pi-${String(n).padStart(2, '0')}`, x, z, radius };
  return {
    ok: true,
    document: withValue(document, `${section}/pis`, [...pis.slice(0, index), pi, ...pis.slice(index)]),
    changes: [{ pointer: `${section}/pis/${index}`, before: undefined, after: pi }],
  };
}

/** A PI removed from its Section; refused while a Position in the Section measures from it. */
export function removeCoursePi(document: Json, pointer: string): CourseEditResult {
  const match = /^(.*)\/pis\/(0|[1-9][0-9]*)$/.exec(pointer);
  const pi = match ? valueAt(document, pointer) : undefined;
  if (!match || !pi || typeof pi !== 'object' || Array.isArray(pi))
    return { ok: false, reason: `${pointer} is not a PI` };
  const section = match[1]!;
  const users = positionsFrom(valueAt(document, section), section, pi.id);
  if (users.length)
    return {
      ok: false,
      reason: `${users.length} Position${users.length === 1 ? '' : 's'} measure from PI ${String(pi.id)}, first ${users[0]}; re-anchor them first`,
    };
  const pis = valueAt(document, `${section}/pis`) as Json[];
  return {
    ok: true,
    document: withValue(
      document,
      `${section}/pis`,
      pis.filter((_, i) => i !== Number(match[2])),
    ),
    changes: [{ pointer, before: pi, after: undefined }],
  };
}

/** The Pointers of the Positions under `value` measured from PI `id`. */
function positionsFrom(value: Json | undefined, pointer: string, id: Json | undefined): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  if (!Array.isArray(value) && value.pi === id && 'offset' in value) found.push(pointer);
  for (const [key, child] of Object.entries(value)) found.push(...positionsFrom(child, childPointer(pointer, key), id));
  return found;
}
