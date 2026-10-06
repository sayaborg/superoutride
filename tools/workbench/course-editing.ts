import {
  moveCourseElement,
  moveCourseJoint,
  setCourseArcRadius,
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
 * press. Only the selected element drags: a plan element's joint moves along the Section, the element before it and
 * the element taking up the move; where an arc's tangents meet sets its radius, its turning angle and that meeting
 * point kept; a near end of a wall, curb or open limit moves that Position; anything else with a Position moves its
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
    if (!plan) return null;
    // The joint a plan element starts at: the element before it and the element take up the move between them.
    if (element.kind === 'plan' && picked?.pointer === element.pointer && picked.kind === 'plan') {
      const from = plan.nearest(at.x, at.z).s;
      return drag(`Move the joint of ${element.pointer}`, (p) =>
        moveCourseJoint(base, element.pointer, plan.nearest(p.x, p.z).s - from, step),
      );
    }
    // Where an arc's tangents meet: along the line to the arc's middle, it sets the radius.
    if (
      (element.kind === 'tangent-point' || element.kind === 'plan') &&
      picked?.kind === 'tangent-point' &&
      picked.pointer === element.pointer
    ) {
      const point = picked;
      const radius = Number(
        host.elements().find((e) => e.kind === 'plan' && e.pointer === element.pointer)?.values.radius,
      );
      const middle = plan.toWorld(point.s!, 0);
      const reach = Math.hypot(middle.x - point.x!, middle.z - point.z!);
      if (!(radius > 0 && reach > 0)) return null;
      const ux = (middle.x - point.x!) / reach,
        uz = (middle.z - point.z!) / reach;
      return drag(`Set ${element.pointer}/radius`, (p) => {
        const along = reach + (p.x - at.x) * ux + (p.z - at.z) * uz;
        return setCourseArcRadius(
          base,
          element.pointer,
          snapCourseValue(Math.max(radius * 0.01, (radius * along) / reach), step),
        );
      });
    }
    if (element.point === 'derived' || element.kind === 'plan') return null;
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
const VALUE_FIELDS = ['length', 'radius', 'y', 'curveLength', 'bottom', 'top', 'every', 'count'];

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
      label: `${field} offset (from ${element.positions[field]!.joint})`,
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
