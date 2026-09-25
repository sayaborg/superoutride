import {
  CourseInputError,
  courseFailure,
  courseSuccess,
  type CourseResult,
} from '../../src/course/course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { readCourseDocument, type CourseDocument } from '../../src/course/course-document.js';
import { compileCourseDocument, type CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import type { SurfaceMaterialCatalog } from '../../src/course/surface-material.js';

interface CourseProjectState {
  readonly source: CourseDocument | null;
  readonly compiled: CompiledCourse | null;
  /** Retained for comparison/recovery, never returned by exportCompiled after an edit. */
  readonly lastSuccessful: CompiledCourse | null;
}
type ProjectFailure = { readonly ok: false; readonly reason: 'no_source' | 'stale_source' };
type ProjectResult<T> = CourseResult<T> | ProjectFailure;

/** Live authoring session; documents and published products themselves are immutable snapshots. */
export function createCourseProject(materials: SurfaceMaterialCatalog) {
  let state: CourseProjectState = Object.freeze({ source: null, compiled: null, lastSuccessful: null });
  let generation = 0;
  const noSource = (): ProjectFailure => Object.freeze({ ok: false, reason: 'no_source' });
  const stale = (): ProjectFailure => Object.freeze({ ok: false, reason: 'stale_source' });
  return Object.freeze({
    getState: (): CourseProjectState => state,
    editDocument(input: unknown): CourseResult<CourseDocument> {
      const result = readCourseDocument(input);
      if (!result.ok) return result;
      if (JSON.stringify(result.value) !== JSON.stringify(state.source)) {
        generation += 1;
        state = Object.freeze({ source: result.value, compiled: null, lastSuccessful: state.lastSuccessful });
      }
      return courseSuccess(state.source!);
    },
    save(): ProjectResult<string> {
      return state.source ? saveCourseDocument(state.source) : noSource();
    },
    async compile(
      assetSources: readonly CourseAssetBytes[] = [],
      document = '',
    ): Promise<ProjectResult<CompiledCourse>> {
      if (!state.source) return noSource();
      const ticket = ++generation;
      const result = await compileCourseDocument(state.source, assetSources, materials, document);
      if (ticket !== generation) return stale();
      if (result.ok)
        state = Object.freeze({ source: state.source, compiled: result.value, lastSuccessful: result.value });
      return result;
    },
    async importDocument(
      text: string,
      assetSources: readonly CourseAssetBytes[] = [],
      document = '',
    ): Promise<ProjectResult<CompiledCourse>> {
      const parsed = parseCourseDocument(text);
      if (!parsed.ok) return parsed;
      const ticket = ++generation;
      const result = await compileCourseDocument(parsed.value, assetSources, materials, document);
      if (ticket !== generation) return stale();
      if (result.ok)
        state = Object.freeze({ source: parsed.value, compiled: result.value, lastSuccessful: result.value });
      return result;
    },
    exportCompiled(): ProjectResult<CompiledCourse> {
      return state.compiled ? courseSuccess(state.compiled) : stale();
    },
  });
}

export function parseCourseDocument(text: string): CourseResult<CourseDocument> {
  if (typeof text !== 'string') throw new TypeError('CourseDocument JSON must be a string');
  if (
    text.length > COURSE_DOCUMENT_LIMITS.jsonBytes ||
    new TextEncoder().encode(text).byteLength > COURSE_DOCUMENT_LIMITS.jsonBytes
  ) {
    return courseFailure(
      new CourseInputError('resource_limit', '', `Document exceeds ${COURSE_DOCUMENT_LIMITS.jsonBytes} UTF-8 bytes`),
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return courseFailure(new CourseInputError('parse_failure', '', error.message));
    throw error;
  }
  return readCourseDocument(input);
}

function saveCourseDocument(input: unknown): CourseResult<string> {
  const result = readCourseDocument(input);
  return result.ok ? courseSuccess(JSON.stringify(result.value)) : result;
}
