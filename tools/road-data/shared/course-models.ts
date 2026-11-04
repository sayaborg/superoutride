/**
 * The courses' models ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)): K's course data,
 * each circuit as it was in its original's year drawn at real size in straights and arcs (`course-models.json`, K's
 * file as K gave it), read once and admitted: each segment's geometry agrees with itself, each joins the next, the last
 * the first, in place and heading.
 */
import { readFileSync } from 'node:fs';
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
}

const MODELS_FILE = '/tools/road-data/shared/course-models.json';
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
  requireInput(isRecord(s) && isPoint(s.start) && isPoint(s.end) && isLength(s.length_m), at, 'A segment');
  const [start, end, length] = [s.start, s.end, s.length_m];
  if (s.type === 'line') {
    requireInput(Math.abs(Math.hypot(end[0] - start[0], end[1] - start[1]) - length) <= SELF, at, "A line's length");
    const heading = Math.atan2(end[1] - start[1], end[0] - start[0]);
    return { piece: { length, turn: 0 }, start, end, from: heading, to: heading };
  }
  requireInput(s.type === 'arc', `${at}/type`, 'A segment is a line or an arc');
  const { center, radius_m: radius, sweep_rad: sweep } = s;
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

/** The model `id` from the models' file, which is admitted once. */
export function courseModel(id: string): CourseModel {
  read ??= readModels();
  const model = read.get(id);
  requireInput(model, MODELS_FILE, `The models' file holds no model ${id}`);
  return model;
}

function readModels(): ReadonlyMap<string, CourseModel> {
  const document: unknown = JSON.parse(readFileSync(new URL('./course-models.json', import.meta.url), 'utf8'));
  requireInput(isRecord(document) && Array.isArray(document.layouts), MODELS_FILE, 'Its shape');
  const models = new Map<string, CourseModel>();
  document.layouts.forEach((layout: unknown, k) => {
    const at = `${MODELS_FILE}/layouts/${k}`;
    requireInput(
      isRecord(layout) &&
        typeof layout.id === 'string' &&
        typeof layout.course === 'string' &&
        isLength(layout.length_m) &&
        Array.isArray(layout.segments) &&
        layout.segments.length > 0,
      at,
      'A layout',
    );
    requireInput(!models.has(layout.id), `${at}/id`, 'One layout an id');
    const segments = layout.segments.map((s: unknown, i) => admitSegment(s, `${at}/segments/${i}`));
    segments.forEach((s, i) => {
      const next = segments[(i + 1) % segments.length]!;
      requireInput(
        Math.hypot(next.start[0]! - s.end[0]!, next.start[1]! - s.end[1]!) <= JOIN &&
          Math.abs(wrap(next.from - s.to)) <= KINK,
        `${at}/segments/${i}`,
        'A segment joins the next in place and heading',
      );
    });
    const path = new CoursePath(segments.map((s) => s.piece));
    requireInput(Math.abs(path.length - layout.length_m) <= SELF * segments.length, `${at}/length_m`, 'Its length');
    const turning = path.elements.reduce((sum, e) => sum + e.turn, 0) / (2 * Math.PI);
    requireInput(Math.abs(turning - Math.round(turning)) <= KINK, at, 'A layout turns whole turns');
    models.set(
      layout.id,
      Object.freeze({
        id: layout.id,
        course: layout.course,
        length: path.length,
        path,
        turns: Math.round(turning),
        geometry: layout.segments,
      }),
    );
  });
  return models;
}
