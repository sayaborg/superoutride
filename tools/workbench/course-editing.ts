import {
  moveCourseElement,
  setCourseNumbers,
  snapCourseValue,
  type CourseEditResult,
} from '../authoring/course-edits.js';
import type { CourseElement, SectionPlan } from '../authoring/course-structure.js';
import { valueAt, type Json } from '../authoring/json-pointer.js';
import type { PlanDrag } from './course-plan-view.js';
import type { ProfileDrag } from './course-profile-view.js';

/** What the editing reads from the course module, and how it shows and commits a pending edit. */
export interface CourseEditHost {
  document(): Json | null;
  selected(): CourseElement | null;
  plan(): SectionPlan | null;
  /** The open Section's elements. */
  elements(): readonly CourseElement[];
  /** The snapping step, or null when off. */
  step(): number | null;
  /** Draw a pending edit (null when it ends). */
  preview(result: CourseEditResult | null): void;
  /** One step: the edited document replaces the course's. */
  commit(document: Json, label: string): void;
}

/** Screen pixels within which a press grabs an end of a wall, curb or open limit. */
const END_PIXELS = 10;

/**
 * The plan's drags, each an edit that keeps form, made by the core's edit functions on the document as it was at the
 * press. Only the selected element drags: a PI moves its `x` and `z`; an arc end sets its PI's `radius` (the tangent
 * length grows with the radius); a near end of a wall, curb or open limit moves that Position; anything else moves its
 * Positions and laterals along and across the Section. The pending document is previewed and committed on release.
 */
export function createPlanEditing(host: CourseEditHost) {
  const drag = (label: string, edit: (at: { x: number; z: number }) => CourseEditResult) =>
    pendingDrag(host, label, edit);
  return (at: { x: number; z: number }, pixel: number, picked: CourseElement | null): PlanDrag | null => {
    const element = host.selected(),
      base = host.document(),
      plan = host.plan();
    if (!element || !base) return null;
    const step = host.step();
    if (element.kind === 'pi' && picked?.pointer === element.pointer) {
      const x = Number(element.x),
        z = Number(element.z);
      return drag(`Move ${element.pointer}`, (p) =>
        setCourseNumbers(base, [
          { pointer: `${element.pointer}/x`, value: snapCourseValue(x + p.x - at.x, step) },
          { pointer: `${element.pointer}/z`, value: snapCourseValue(z + p.z - at.z, step) },
        ]),
      );
    }
    if (!plan) return null;
    // Either end of the selected PI's arc.
    if (element.kind === 'arc-end' && picked?.kind === 'arc-end' && picked.pointer === element.pointer) {
      const pi = host.elements().find((e) => e.kind === 'pi' && e.pointer === element.derivedFrom);
      const radius = Number(pi?.values.radius);
      if (!pi || !(radius > 0)) return null;
      const reach = Math.hypot(picked.x! - pi.x!, picked.z! - pi.z!);
      const ux = (picked.x! - pi.x!) / reach,
        uz = (picked.z! - pi.z!) / reach;
      return drag(`Set ${pi.pointer}/radius`, (p) => {
        const along = (p.x - pi.x!) * ux + (p.z - pi.z!) * uz;
        return setCourseNumbers(base, [
          {
            pointer: `${pi.pointer}/radius`,
            value: snapCourseValue(Math.max(radius * 0.01, (radius * along) / reach), step),
          },
        ]);
      });
    }
    if (element.point === 'derived') return null;
    const from = plan.nearest(at.x, at.z);
    // A near end of an element with two Positions moves that end alone.
    const ends = Object.entries(element.positions).filter(([, position]) => position.s !== null);
    let fields: string[] | undefined;
    if (ends.length > 1) {
      const near = ends
        .map(([field, position]) => {
          const p = plan.toWorld(position.s!, lateralAt(element, position.s!));
          return { field, distance: Math.hypot(p.x - at.x, p.z - at.z) };
        })
        .sort((a, b) => a.distance - b.distance)[0]!;
      if (near.distance < END_PIXELS * pixel) fields = [near.field];
      else if (picked?.pointer !== element.pointer) return null;
    } else if (picked?.pointer !== element.pointer) return null;
    return drag(`Move ${element.pointer}${fields ? `/${fields[0]}` : ''}`, (p) => {
      const to = plan.nearest(p.x, p.z);
      return moveCourseElement(base, element, {
        ds: to.s - from.s,
        dl: fields ? 0 : to.l - from.l,
        ...(fields ? { fields } : {}),
        step,
      });
    });
  };
}

/** A drag whose every movement is an edit of the document as it was at the press: previewed, committed on release. */
function pendingDrag<T>(host: CourseEditHost, label: string, edit: (at: T) => CourseEditResult) {
  let last: CourseEditResult | null = null;
  return {
    move(at: T) {
      last = edit(at);
      host.preview(last);
    },
    end(commit: boolean) {
      host.preview(null);
      if (commit && last?.ok && last.changes.length) host.commit(last.document, label);
    },
  };
}

/** One edit after another, as one: the second edits the first's document; either's refusal is the result. */
function chain(first: CourseEditResult, next: (document: Json) => CourseEditResult): CourseEditResult {
  if (!first.ok) return first;
  const second = next(first.document);
  return second.ok ? { ...second, changes: [...first.changes, ...second.changes] } : second;
}

/**
 * The profile's drags: the selected PVI moves its Position's `offset` and its `y` (its PI stays); either end of its
 * vertical curve sets its `curveLength`, twice the end's distance from the PVI.
 */
export function createProfileEditing(host: CourseEditHost) {
  return (at: { s: number; h: number }, picked: CourseElement | null): ProfileDrag | null => {
    const element = host.selected(),
      base = host.document();
    if (!element || !base || !picked || picked.pointer !== element.pointer) return null;
    const pvi = host.elements().find((e) => e.kind === 'pvi' && e.pointer === element.pointer);
    if (!pvi || pvi.s === null) return null;
    const step = host.step();
    if (picked.kind === 'pvi') {
      const y = Number(pvi.values.y);
      return pendingDrag(host, `Move ${pvi.pointer}`, (p: { s: number; h: number }) =>
        chain(moveCourseElement(base, pvi, { ds: p.s - at.s, step }), (document) =>
          setCourseNumbers(document, [{ pointer: `${pvi.pointer}/y`, value: snapCourseValue(y + p.h - at.h, step) }]),
        ),
      );
    }
    if (picked.kind === 'curve-end')
      return pendingDrag(host, `Set ${pvi.pointer}/curveLength`, (p: { s: number; h: number }) =>
        setCourseNumbers(base, [
          { pointer: `${pvi.pointer}/curveLength`, value: snapCourseValue(2 * Math.abs(p.s - pvi.s!), step) },
        ]),
      );
    return null;
  };
}

/** The element's lateral at `s`: its own line's, else its resolved lateral, else the centreline. */
function lateralAt(element: CourseElement, s: number): number {
  const line = element.lines.line ?? element.lines.left ?? element.lines.right;
  if (line?.length) {
    const i = line.findIndex((v) => v.s >= s);
    if (i <= 0) return line[i === 0 ? 0 : line.length - 1]!.l;
    const a = line[i - 1]!,
      b = line[i]!;
    return a.l + ((b.l - a.l) * (s - a.s)) / (b.s - a.s || 1);
  }
  return element.l ?? 0;
}

/** Numbers of these names written in an element's record are edited as fields. */
const VALUE_FIELDS = ['x', 'z', 'radius', 'y', 'curveLength', 'bottom', 'top', 'every', 'count'];

/**
 * The written numbers of an element, each a field: its Positions' offsets, its laterals (the number, or a reference's
 * offset) and its other written numbers, then the `every` and `count` of each repeat enclosing it.
 */
export function writtenNumbers(
  element: CourseElement,
  document: Json,
): { label: string; pointer: string; value: number }[] {
  if (element.point === 'derived') return [];
  const fields: { label: string; pointer: string }[] = [
    ...Object.keys(element.positions).map((field) => ({
      label: `${field} offset (from PI ${element.positions[field]!.pi})`,
      pointer: `${element.pointer}/${field}/offset`,
    })),
    ...Object.entries(element.laterals).map(([field, lateral]) =>
      lateral.form === 'absolute'
        ? { label: `${field} (absolute)`, pointer: `${element.pointer}/${field}` }
        : { label: `${field} offset (from ${lateral.boundary})`, pointer: `${element.pointer}/${field}/offset` },
    ),
    ...VALUE_FIELDS.map((key) => ({ label: key, pointer: `${element.pointer}/${key}` })),
    ...element.copies.flatMap((copy) =>
      ['every', 'count'].map((key) => ({ label: `${key} of ${copy.path}`, pointer: `${copy.path}/${key}` })),
    ),
  ];
  return fields.flatMap((field) => {
    const value = valueAt(document, field.pointer);
    return typeof value === 'number' ? [{ ...field, value }] : [];
  });
}
