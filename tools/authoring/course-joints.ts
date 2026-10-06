import type { SectionDocument } from '../../src/course/course-document.js';
import { compileCourseGeometry, nearestCourseJoint, type CourseJoints } from '../../src/course/course-geometry.js';
import type { CourseChange } from './course-edits.js';
import { childPointer, valueAt, withValue, type Json } from './json-pointer.js';

/** Numbers an operation computes from resolved values are written to this step, which drops floating-point noise. */
const COMPUTED_STEP = 1e-9;
export const computedValue = (value: number) => Number((Math.round(value / COMPUTED_STEP) * COMPUTED_STEP).toFixed(9));

type JsonRecord = { [key: string]: Json };
const isPosition = (value: Json | undefined): value is { joint: string; offset: number } =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof value.joint === 'string' &&
  typeof value.offset === 'number' &&
  Object.keys(value).length === 2;

/** A Section's joints, or null when its plan does not compile. */
function jointsOf(section: Json | undefined, pointer: string): CourseJoints | null {
  try {
    return compileCourseGeometry(section as unknown as SectionDocument, pointer).joints;
  } catch {
    return null;
  }
}

/** The Section indices the changed Pointers fall in. */
export function changedSections(changes: readonly CourseChange[]): number[] {
  const found = new Set<number>();
  for (const { pointer } of changes) {
    const match = /^\/sections\/(0|[1-9][0-9]*)(?=\/|$)/.exec(pointer);
    if (match) found.add(Number(match[1]));
  }
  return [...found];
}

/**
 * Every Position of the chosen Sections (all when none are named) measured again from the joint nearest its station,
 * the station kept: the one way a Position is written. The new offset is written to the nanometre unless that would
 * make another joint the nearest. A Position whose joint is unknown, or whose Section's plan does not compile, stays.
 * Returns the new document and each rewritten Position, before and after.
 */
export function normalizeCoursePositions(
  document: Json,
  sections?: readonly number[],
): { document: Json; changes: CourseChange[] } {
  const list = valueAt(document, '/sections');
  if (!Array.isArray(list)) return { document, changes: [] };
  let next = document;
  const changes: CourseChange[] = [];
  for (const index of sections ?? list.map((_, i) => i)) {
    const pointer = `/sections/${index}`;
    const section = list[index];
    const joints = jointsOf(section, pointer);
    if (!joints) continue;
    const visit = (value: Json | undefined, at: string) => {
      if (isPosition(value)) {
        const from = joints.stations.get(value.joint);
        if (from === undefined) return;
        const s = from + value.offset;
        const joint = nearestCourseJoint(joints, s);
        if (joint === value.joint) return;
        const station = joints.stations.get(joint)!;
        let offset = computedValue(s - station);
        if (nearestCourseJoint(joints, station + offset) !== joint) offset = s - station;
        const after = { joint, offset };
        next = withValue(next, at, after);
        changes.push({ pointer: at, before: value, after });
        return;
      }
      if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${at}/${i}`));
      else if (typeof value === 'object' && value !== null)
        for (const [key, item] of Object.entries(value as JsonRecord)) visit(item, childPointer(at, key));
    };
    visit(section, pointer);
  }
  return { document: next, changes };
}

/**
 * An edit's document and changes with its Sections' Positions measured again from their nearest joints: a rewritten
 * Position replaces the edit's own changes within it, from the value before the edit.
 */
export function withNormalizedPositions(
  before: Json,
  document: Json,
  changes: readonly CourseChange[],
): { document: Json; changes: CourseChange[] } {
  const normalized = normalizeCoursePositions(document, changedSections(changes));
  const rewritten = normalized.changes.map((change) => change.pointer);
  const within = (pointer: string) => rewritten.some((p) => pointer === p || pointer.startsWith(`${p}/`));
  return {
    document: normalized.document,
    changes: [
      ...changes.filter((change) => !within(change.pointer)),
      ...normalized.changes.map((change) => ({ ...change, before: valueAt(before, change.pointer) })),
    ],
  };
}
