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
    const ground = section.presentation.ground;
    if (ground.kind !== 'resident') throw new GroundDataError('invalid_ground', 'Expected a resident-ground course');
    return ground;
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
  const table = new Map(
    course.sections.map((section, index) => [
      section,
      Object.freeze({ kind: 'resident' as const, ...product.readers[index]! }),
    ]),
  );
  return Object.freeze({
    kind: 'resident' as const,
    kMax: product.kMax,
    metrics: Object.freeze({ kind: 'resident' as const, ...product.metrics }),
    forSection(section: CompiledSection) {
      const reader = table.get(section);
      if (!reader) throw new GroundDataError('invalid_ground', 'Section is outside the admitted resident course');
      return reader;
    },
  });
}
/** Bands already contain their completed s profiles; no resident payload is acquired. */
export function createBandCourseGround(course: CompiledCourse) {
  const table = new Map(
    course.sections.map((section) => {
      const ground = section.presentation?.ground;
      if (!ground || ground.kind !== 'bands')
        throw new GroundDataError('invalid_ground', 'Expected a Band-ground course');
      return [section, ground] as const;
    }),
  );
  const products = [...table.values()];
  const sum = (key: 'expandedBands' | 'preblendCells' | 'profiles' | 'coefficientBytes' | 'directoryBytes') =>
    products.reduce((n, p) => n + p.metrics[key], 0);
  return Object.freeze({
    kind: 'bands' as const,
    metrics: Object.freeze({
      kind: 'bands' as const,
      sectionCount: products.length,
      expandedBands: sum('expandedBands'),
      maxActiveBands: Math.max(...products.map((p) => p.metrics.maxActiveBands)),
      preblendCells: sum('preblendCells'),
      profiles: sum('profiles'),
      coefficientBytes: sum('coefficientBytes'),
      directoryBytes: sum('directoryBytes'),
    }),
    forSection(section: CompiledSection) {
      const reader = table.get(section);
      if (!reader) throw new GroundDataError('invalid_ground', 'Section is outside the admitted Band course');
      return reader;
    },
  });
}
export type CourseGround = Awaited<ReturnType<typeof readCourseGround>> | ReturnType<typeof createBandCourseGround>;
