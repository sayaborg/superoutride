import type { SectionDocument } from '../../src/course/course-document.js';
import { compileCourseGeometry, nearestCourseJoint, type CourseJoints } from '../../src/course/course-geometry.js';
import type { CourseChange, CourseEditResult } from './course-edits.js';
import { computedValue } from './course-joints.js';
import { readCourseSection } from './course-structure.js';
import { childPointer, valueAt, withValue, type Json } from './json-pointer.js';

// Edits of a Section's lanes and medians, each one step that changes written values only: adding, removing and
// reordering them, choosing the centre lane, and tapering a width between two stations.

type JsonRecord = { [key: string]: Json };
const isRecord = (value: Json | undefined): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The lanes list a lane or median Pointer is in, its Section and index. */
function laneAt(document: Json, pointer: string) {
  const match = /^(\/sections\/(0|[1-9][0-9]*))\/lanes\/(0|[1-9][0-9]*)$/.exec(pointer);
  const list = match ? valueAt(document, `${match[1]}/lanes`) : undefined;
  if (!match || !Array.isArray(list) || !isRecord(list[Number(match[3])])) return null;
  return { section: match[1]!, sectionIndex: Number(match[2]), list, index: Number(match[3]) };
}

/** A new lane id the Section lacks. */
function newLaneId(list: readonly Json[]): string {
  const ids = new Set(list.map((element) => (isRecord(element) ? element.id : null)));
  let n = list.length;
  while (ids.has(`lane-${String(n).padStart(2, '0')}`)) n++;
  return `lane-${String(n).padStart(2, '0')}`;
}

/** A lane (with a new id) or a median of `width`, inserted at `index` of a Section's lanes. */
export function addCourseLane(
  document: Json,
  section: string,
  index: number,
  kind: 'lane' | 'median',
  width: number,
): CourseEditResult {
  const list = valueAt(document, `${section}/lanes`);
  if (!Array.isArray(list)) return { ok: false, reason: `${section} has no lanes` };
  if (!Number.isInteger(index) || index < 0 || index > list.length)
    return { ok: false, reason: `A lane index must be 0 to ${list.length}` };
  if (!(width > 0)) return { ok: false, reason: 'A new lane or median is wider than zero' };
  const element: Json = kind === 'lane' ? { kind, id: newLaneId(list), width } : { kind, width };
  return {
    ok: true,
    document: withValue(document, `${section}/lanes`, [...list.slice(0, index), element, ...list.slice(index)]),
    changes: [{ pointer: `${section}/lanes/${index}`, before: undefined, after: element }],
  };
}

/** The Pointers in the course naming lane `id` of the Section at `section`: references, grid slots, Links, centre. */
function laneUsers(document: Json, section: string, id: string): string[] {
  const found: string[] = [];
  const visit = (value: Json | undefined, pointer: string) => {
    if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${pointer}/${i}`));
    else if (isRecord(value)) {
      if (value.lane === id) found.push(pointer);
      for (const [key, item] of Object.entries(value)) visit(item, childPointer(pointer, key));
    }
  };
  const record = valueAt(document, section);
  if (isRecord(record)) {
    if (record.centerLane === id) found.push(`${section}/centerLane`);
    visit(record, section);
  }
  const links = valueAt(document, '/links');
  const sectionId = isRecord(record) ? record.id : null;
  if (Array.isArray(links))
    links.forEach((link, i) => {
      if (isRecord(link) && isRecord(link.from) && link.from.section === sectionId && link.from.lane === id)
        found.push(`/links/${i}/from/lane`);
    });
  return found;
}

/** A lane or median removed; a lane is refused while anything names it. */
export function removeCourseLane(document: Json, pointer: string): CourseEditResult {
  const found = laneAt(document, pointer);
  if (!found) return { ok: false, reason: `${pointer} is not a lane or median` };
  const element = found.list[found.index] as JsonRecord;
  if (element.kind === 'lane') {
    const users = laneUsers(document, found.section, String(element.id));
    if (users.length)
      return {
        ok: false,
        reason: `${users.length} value${users.length === 1 ? '' : 's'} name lane ${String(element.id)}, first ${users[0]}`,
      };
  }
  return {
    ok: true,
    document: withValue(
      document,
      `${found.section}/lanes`,
      found.list.filter((_, i) => i !== found.index),
    ),
    changes: [{ pointer, before: element, after: undefined }],
  };
}

/** A lane or median moved one place left (-1) or right (+1) in its Section's order. */
export function moveCourseLane(document: Json, pointer: string, step: -1 | 1): CourseEditResult {
  const found = laneAt(document, pointer);
  if (!found) return { ok: false, reason: `${pointer} is not a lane or median` };
  const other = found.index + step;
  if (other < 0 || other >= found.list.length) return { ok: false, reason: 'Nothing lies that way' };
  const list = [...found.list];
  [list[found.index], list[other]] = [list[other]!, list[found.index]!];
  return {
    ok: true,
    document: withValue(document, `${found.section}/lanes`, list),
    changes: [
      { pointer, before: found.list[found.index]!, after: list[found.index]! },
      { pointer: `${found.section}/lanes/${other}`, before: found.list[other]!, after: list[other]! },
    ],
  };
}

/**
 * What choosing lane `id` as the centre lane moves: every absolute lateral keeps its number, so the lanes move across
 * the centreline by the new centre lane's centre, read now, at the Section's start and end, with the count of absolute
 * laterals that thereby change meaning relative to the lanes. Null when the lanes do not resolve.
 */
export function centerLaneShift(document: Json, section: string, id: string) {
  const index = Number(/\/sections\/(\d+)$/.exec(section)?.[1]);
  const read = readCourseSection(document, index);
  const lane = read.structure.elements.find((e) => e.kind === 'lane' && e.values.id === id);
  const centre = lane?.lines.lane;
  if (!centre?.length) return null;
  const absolutes = read.structure.elements.reduce(
    (n, e) => n + Object.values(e.laterals).filter((l) => l.form === 'absolute').length,
    0,
  );
  return { start: -centre[0]!.l, end: -centre.at(-1)!.l, absolutes };
}

/** Lane `id` the centre lane of its Section: its centre becomes the centreline (see `centerLaneShift`). */
export function setCourseCenterLane(document: Json, section: string, id: string): CourseEditResult {
  const before = valueAt(document, `${section}/centerLane`);
  const list = valueAt(document, `${section}/lanes`);
  if (typeof before !== 'string' || !Array.isArray(list)) return { ok: false, reason: `${section} has no lanes` };
  if (!list.some((element) => isRecord(element) && element.kind === 'lane' && element.id === id))
    return { ok: false, reason: `No lane ${id} in ${section}` };
  if (before === id) return { ok: true, document, changes: [] };
  return {
    ok: true,
    document: withValue(document, `${section}/centerLane`, id),
    changes: [{ pointer: `${section}/centerLane`, before, after: id }],
  };
}

/** A width's values at stations: one number at the Section's ends, or its written values, resolved. */
function widthKnots(width: Json | undefined, joints: CourseJoints) {
  if (typeof width === 'number')
    return [
      { s: 0, width },
      { s: joints.length, width },
    ];
  if (!Array.isArray(width)) return null;
  const knots: { s: number; width: number }[] = [];
  for (const knot of width) {
    if (!isRecord(knot) || !isRecord(knot.at) || typeof knot.width !== 'number') return null;
    const station = joints.stations.get(String(knot.at.joint));
    if (station === undefined || typeof knot.at.offset !== 'number') return null;
    knots.push({ s: station + knot.at.offset, width: knot.width });
  }
  return knots;
}

const widthAt = (knots: readonly { s: number; width: number }[], s: number) => {
  let i = 1;
  while (i < knots.length - 1 && knots[i]!.s < s) i++;
  const a = knots[i - 1]!,
    b = knots[i]!;
  return s <= a.s ? a.width : s >= b.s ? b.width : a.width + ((b.width - a.width) * (s - a.s)) / (b.s - a.s);
};

/** A width written from values at stations: one number when they are all the same. */
function writtenWidth(knots: readonly { s: number; width: number }[], joints: CourseJoints): Json {
  if (knots.every((knot) => knot.width === knots[0]!.width)) return knots[0]!.width;
  return knots.map(({ s, width }) => {
    const joint = nearestCourseJoint(joints, s);
    return { at: { joint, offset: computedValue(s - joints.stations.get(joint)!) }, width: computedValue(width) };
  });
}

/**
 * A lane's or median's width tapered from what it is at station `start` to `width` at station `end`: values written
 * at both stations, those between removed and those after kept. A width whose values all agree is written as one
 * number.
 */
export function taperCourseWidth(
  document: Json,
  pointer: string,
  start: number,
  end: number,
  width: number,
): CourseEditResult {
  const found = laneAt(document, pointer);
  if (!found) return { ok: false, reason: `${pointer} is not a lane or median` };
  let joints: CourseJoints;
  try {
    joints = compileCourseGeometry(
      valueAt(document, found.section) as unknown as SectionDocument,
      found.section,
    ).joints;
  } catch {
    return { ok: false, reason: 'The Section plan does not compile' };
  }
  if (!(start >= 0 && start < end && end <= joints.length))
    return { ok: false, reason: `A taper runs from a station to a later one within 0 to ${joints.length} m` };
  if (!(width >= 0)) return { ok: false, reason: 'A width is zero or more' };
  const before = valueAt(document, `${pointer}/width`);
  const knots = widthKnots(before, joints);
  if (!knots) return { ok: false, reason: `${pointer}/width does not resolve` };
  const tapered = [
    ...knots.filter((knot) => knot.s < start),
    { s: start, width: widthAt(knots, start) },
    { s: end, width },
    ...knots.filter((knot) => knot.s > end),
  ];
  // The width runs from the Section's start to its end.
  if (tapered[0]!.s > 0) tapered.unshift({ s: 0, width: tapered[0]!.width });
  if (tapered.at(-1)!.s < joints.length) tapered.push({ s: joints.length, width: tapered.at(-1)!.width });
  const after = writtenWidth(tapered, joints);
  const changes: CourseChange[] = [{ pointer: `${pointer}/width`, before, after }];
  return { ok: true, document: withValue(document, `${pointer}/width`, after), changes };
}

/** One value of a width written at Positions removed (not its first or last); one number when the rest agree. */
export function removeCourseWidthKnot(document: Json, pointer: string): CourseEditResult {
  const match = /^(.*)\/width\/(0|[1-9][0-9]*)$/.exec(pointer);
  const owner = match ? laneAt(document, match[1]!) : null;
  const width = match ? valueAt(document, `${match[1]}/width`) : undefined;
  if (!match || !owner || !Array.isArray(width)) return { ok: false, reason: `${pointer} is not a width value` };
  const index = Number(match[2]);
  if (index === 0 || index === width.length - 1)
    return { ok: false, reason: "A width's first and last values hold its ends" };
  const rest = width.filter((_, i) => i !== index);
  const values = rest.map((knot) => (isRecord(knot) ? knot.width : null));
  const after: Json = values.every((value) => value === values[0]) ? values[0]! : rest;
  return {
    ok: true,
    document: withValue(document, `${match[1]}/width`, after),
    changes: [{ pointer: `${match[1]}/width`, before: width, after }],
  };
}
