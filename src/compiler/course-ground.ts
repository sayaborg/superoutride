import type { CompiledCourse } from './compiled-course.js';
import type { CompiledSection } from './course-graph.js';
import { compileResidentGround } from '../groundmap/compile-resident-ground.js';
import {
  readResidentGround,
  validateGroundManifest,
  groundGrid,
  GroundDataError,
} from '../groundmap/resident-ground.js';

const sources = (course: CompiledCourse) =>
  course.sections.map((section) => {
    if (!section.presentation)
      throw new GroundDataError('invalid_ground', `Section ${section.id} has no ground presentation`);
    return section.presentation.ground;
  });
export function compileCourseGround(course: CompiledCourse) {
  return compileResidentGround(sources(course), course.identity.buildSha256);
}
export function courseGroundPreflight(course: CompiledCourse, input: unknown) {
  return validateGroundManifest(
    input,
    course.identity.buildSha256,
    sources(course).map((data) => groundGrid(data.partition.length, data.left, data.right)),
  );
}
/** Resolve canonical Section references once at the compiled-content admission boundary. */
export async function readCourseGround(course: CompiledCourse, manifest: unknown, payload: Uint8Array<ArrayBuffer>) {
  const product = await readResidentGround(
    manifest,
    payload,
    course.identity.buildSha256,
    sources(course).map((data) => groundGrid(data.partition.length, data.left, data.right)),
  );
  const table = new Map(course.sections.map((section, index) => [section, product.readers[index]!]));
  return Object.freeze({
    kMax: product.kMax,
    metrics: product.metrics,
    forSection(section: CompiledSection) {
      const reader = table.get(section);
      if (!reader) throw new GroundDataError('invalid_ground', 'Section is outside the admitted resident course');
      return reader;
    },
  });
}
export type CourseGround = Awaited<ReturnType<typeof readCourseGround>>;
