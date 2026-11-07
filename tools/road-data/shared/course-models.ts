/**
 * The courses' models ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)): K's course
 * sources (2026-11-08, `course-sources/`, as K gave them), each circuit's layout of its original's years drawn at real
 * size in straights and arcs from its start line (K's estimate), with its circuit's elevation, read once and admitted:
 * each segment's geometry agrees with itself and its stations, each joins the next, the last the first, in place and
 * heading, the first leaves the start pose, and the elevation is a positive length.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { requireInput } from '../../authoring/authoring-error.js';
import { CoursePath, type PathPiece } from './course-path.js';

/** A model: its id, its course, its length, metres, its path from its start line, and its turning, whole turns. */
export interface CourseModel {
  readonly id: string;
  readonly course: string;
  readonly length: number;
  readonly path: CoursePath;
  readonly turns: number;
  /** Its geometry as the file holds it, for the solved laps' digests. */
  readonly geometry: unknown;
  /** Its circuit's elevation, its highest point less its lowest, metres. */
  readonly elevation: number;
}

/** A layout's document as read: its file's name without `.json`, where it is read from, and its content. */
export interface ModelDocument {
  readonly name: string;
  readonly source: string;
  readonly document: unknown;
}

const SOURCES = '/tools/road-data/shared/course-sources/tracks';
/** How far a segment's ends and the next's may part, metres, and their headings, radians (K: within 10 nm). */
const JOIN = 1e-8;
const KINK = 1e-9;
/** How far a segment's lengths, radius and ends may disagree, metres. */
const SELF = 1e-9;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
const isLength = (value: unknown): value is number => typeof value === 'number' && value > 0 && Number.isFinite(value);

/** A heading's difference brought within ±π. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * A segment admitted: its piece (the file's y runs down and an arc's positive sweep turns right, a piece's turn left
 * positive), and its headings at its ends in the file's frame.
 */
function admitSegment(
  s: unknown,
  at: string,
): { piece: PathPiece; start: number[]; end: number[]; from: number; to: number } {
  requireInput(isRecord(s) && isPoint(s.start_xy_m) && isPoint(s.end_xy_m) && isLength(s.length_m), at, 'A segment');
  const [start, end, length] = [s.start_xy_m, s.end_xy_m, s.length_m];
  if (s.type === 'line') {
    requireInput(Math.abs(Math.hypot(end[0] - start[0], end[1] - start[1]) - length) <= SELF, at, "A line's length");
    const heading = Math.atan2(end[1] - start[1], end[0] - start[0]);
    return { piece: { length, turn: 0 }, start, end, from: heading, to: heading };
  }
  requireInput(s.type === 'arc', `${at}/type`, 'A segment is a line or an arc');
  const { center_xy_m: center, radius_m: radius, sweep_rad: sweep } = s;
  requireInput(isPoint(center) && isLength(radius) && typeof sweep === 'number' && sweep !== 0, at, 'An arc');
  const angle = (p: number[]) => Math.atan2(p[1]! - center[1], p[0]! - center[0]);
  const [a, b] = [angle(start), angle(end)];
  requireInput(
    Math.abs(Math.hypot(start[0] - center[0], start[1] - center[1]) - radius) <= SELF &&
      Math.abs(Math.hypot(end[0] - center[0], end[1] - center[1]) - radius) <= SELF &&
      Math.abs(radius * Math.abs(sweep) - length) <= SELF &&
      Math.abs(wrap(a + sweep - b)) * radius <= SELF,
    at,
    "An arc's centre, radius, sweep and ends agree",
  );
  const side = (Math.sign(sweep) * Math.PI) / 2;
  return { piece: { length, turn: -sweep }, start, end, from: a + side, to: b + side };
}

let read: ReadonlyMap<string, CourseModel> | undefined;

/** The model `id` from the course sources, which are admitted once, its course `course` (its original's and name). */
export function courseModel(id: string, course: string): CourseModel {
  read ??= readModels();
  const model = read.get(id);
  requireInput(model, SOURCES, `The course sources hold no model ${id}`);
  requireInput(model.course === course, `${SOURCES}/${id}.json`, `The model ${id} is not ${course}'s`);
  return model;
}

function readModels() {
  const folder = new URL('./course-sources/tracks/', import.meta.url);
  const names = readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .sort();
  return admitModels(
    names.map((file) => ({
      name: file.slice(0, -'.json'.length),
      source: `${SOURCES}/${file}`,
      document: JSON.parse(readFileSync(new URL(file, folder), 'utf8')),
    })),
  );
}

/**
 * The models of the layouts' documents (schema 3.0), admitted: each its file's name its id, its course its original's
 * and its name, its elevation a positive length, its segments' stations running from 0 to its length.
 */
export function admitModels(documents: readonly ModelDocument[]): ReadonlyMap<string, CourseModel> {
  const models = new Map<string, CourseModel>();
  for (const { name, source: at, document: layout } of documents) {
    requireInput(
      isRecord(layout) &&
        layout.schema_version === '3.0' &&
        typeof layout.id === 'string' &&
        typeof layout.game === 'string' &&
        typeof layout.game_course === 'string' &&
        isLength(layout.geometric_length_2d_m) &&
        isRecord(layout.start_pose) &&
        Array.isArray(layout.segments) &&
        layout.segments.length > 0,
      at,
      'A layout (schema 3.0)',
    );
    requireInput(layout.id === name, `${at}/id`, "A layout's id is its file's name");
    requireInput(!models.has(layout.id), `${at}/id`, 'One layout an id');
    requireInput(isLength(layout.elevation_m), `${at}/elevation_m`, 'An elevation is a positive length');
    const pose = layout.start_pose;
    requireInput(
      pose.x_m === 0 && pose.y_m === 0 && typeof pose.heading_rad === 'number' && Number.isFinite(pose.heading_rad),
      `${at}/start_pose`,
      'A layout starts at its origin',
    );
    const segments = layout.segments.map((s: unknown, i) => admitSegment(s, `${at}/segments/${i}`));
    const first = segments[0]!;
    requireInput(
      Math.hypot(first.start[0]!, first.start[1]!) <= JOIN && Math.abs(wrap(first.from - pose.heading_rad)) <= KINK,
      `${at}/segments/0`,
      'The first segment leaves the start pose',
    );
    segments.forEach((s, i) => {
      const next = segments[(i + 1) % segments.length]!;
      requireInput(
        Math.hypot(next.start[0]! - s.end[0]!, next.start[1]! - s.end[1]!) <= JOIN &&
          Math.abs(wrap(next.from - s.to)) <= KINK,
        `${at}/segments/${i}`,
        'A segment joins the next in place and heading',
      );
    });
    const tolerance = SELF * segments.length;
    let station = 0;
    layout.segments.forEach((s, i) => {
      const { s_start_m: from, s_end_m: to, length_m: length } = s as Record<string, unknown>;
      requireInput(
        typeof from === 'number' &&
          typeof to === 'number' &&
          Math.abs(from - station) <= tolerance &&
          Math.abs(to - from - (length as number)) <= tolerance,
        `${at}/segments/${i}`,
        "A segment's stations run on from the last's",
      );
      station = to;
    });
    const path = new CoursePath(segments.map((s) => s.piece));
    requireInput(
      Math.abs(path.length - layout.geometric_length_2d_m) <= tolerance &&
        Math.abs(station - layout.geometric_length_2d_m) <= tolerance,
      `${at}/geometric_length_2d_m`,
      'Its length',
    );
    const turning = path.elements.reduce((sum, e) => sum + e.turn, 0) / (2 * Math.PI);
    requireInput(Math.abs(turning - Math.round(turning)) <= KINK, at, 'A layout turns whole turns');
    models.set(
      layout.id,
      Object.freeze({
        id: layout.id,
        course: `${layout.game} ${layout.game_course}`,
        length: path.length,
        path,
        turns: Math.round(turning),
        geometry: layout.segments,
        elevation: layout.elevation_m,
      }),
    );
  }
  return models;
}
