import {
  admit,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readString,
  type AdmissionResult,
} from '../../src/core/admission.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';

/**
 * The underlay alignments of a course: production-only numbers saved with the course's documents under
 * `content/course-underlays/<course>.json`, which the core neither reads nor delivers. Each Section names the image it
 * was aligned with (its file name and SHA-256; the image itself is never saved) and how its pixels lie on the plan.
 */
export const COURSE_UNDERLAYS_FORMAT = Object.freeze({ format: 'superoutride.course-underlays', version: 1 } as const);
export const COURSE_UNDERLAYS_DIRECTORY = 'course-underlays';

/**
 * How an image lies on a Section's plan: pixel (u, v), v down, is at (x, z) + R(rotation) · (scale · u, −scale · v),
 * where (x, z) is the top-left corner in metres, `scale` metres per pixel and `rotation` the counter-clockwise turn
 * of the image's u axis from +x, in degrees.
 */
export interface UnderlayAlignment {
  readonly image: string;
  readonly sha256: string;
  readonly scale: number;
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
}

export interface CourseUnderlays {
  readonly format: typeof COURSE_UNDERLAYS_FORMAT.format;
  readonly version: typeof COURSE_UNDERLAYS_FORMAT.version;
  /** By Section id. */
  readonly sections: Readonly<Record<string, UnderlayAlignment>>;
}

/** Admit a course's underlay alignments. */
export function readCourseUnderlays(value: unknown, document = ''): AdmissionResult<CourseUnderlays> {
  return admit(document, () => {
    const root = readDocument(value, ['format', 'version', 'sections'], COURSE_UNDERLAYS_FORMAT.format, 1);
    const sections = readDictionary(root.sections, '/sections', (item, at) => {
      const entry = readRecord(item, at, ['image', 'sha256', 'scale', 'x', 'z', 'rotation']);
      return Object.freeze({
        image: readString(entry.image, `${at}/image`, { maxLength: 255 }),
        sha256: readString(entry.sha256, `${at}/sha256`, SHA256_TEXT),
        scale: readNumber(entry.scale, `${at}/scale`, { min: 0, exclusiveMin: true }),
        x: readNumber(entry.x, `${at}/x`),
        z: readNumber(entry.z, `${at}/z`),
        rotation: readNumber(entry.rotation, `${at}/rotation`, { min: -360, max: 360 }),
      });
    });
    return Object.freeze({ ...COURSE_UNDERLAYS_FORMAT, sections });
  });
}

/** The plan point of an image pixel. */
export function underlayToPlan(alignment: Omit<UnderlayAlignment, 'image' | 'sha256'>, u: number, v: number) {
  const angle = (alignment.rotation * Math.PI) / 180;
  const a = alignment.scale * u,
    b = -alignment.scale * v;
  return {
    x: alignment.x + a * Math.cos(angle) - b * Math.sin(angle),
    z: alignment.z + a * Math.sin(angle) + b * Math.cos(angle),
  };
}

/** The image pixel at a plan point. */
export function planToUnderlay(alignment: Omit<UnderlayAlignment, 'image' | 'sha256'>, x: number, z: number) {
  const angle = (alignment.rotation * Math.PI) / 180;
  const dx = x - alignment.x,
    dz = z - alignment.z;
  const a = dx * Math.cos(angle) + dz * Math.sin(angle),
    b = -dx * Math.sin(angle) + dz * Math.cos(angle);
  return { u: a / alignment.scale, v: -b / alignment.scale };
}

/**
 * The scale from two image pixels and the distance between them in metres, keeping the first pixel where it lies on
 * the plan.
 */
export function scaleUnderlay<T extends Omit<UnderlayAlignment, 'image' | 'sha256'>>(
  alignment: T,
  first: { readonly u: number; readonly v: number },
  second: { readonly u: number; readonly v: number },
  metres: number,
): T {
  const pixels = Math.hypot(second.u - first.u, second.v - first.v);
  if (!(pixels > 0) || !(metres > 0)) throw new RangeError('Two distinct points and a positive distance set the scale');
  const scale = metres / pixels;
  const fixed = underlayToPlan(alignment, first.u, first.v);
  const moved = underlayToPlan({ ...alignment, scale }, first.u, first.v);
  return { ...alignment, scale, x: alignment.x + fixed.x - moved.x, z: alignment.z + fixed.z - moved.z };
}
