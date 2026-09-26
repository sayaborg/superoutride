import { courseSuccess, type CourseResult } from '../../src/course/course-diagnostics.js';
import { readCourseDocument, readCourseDocumentBytes, type CourseDocument } from '../../src/course/course-document.js';
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

/** Live authoring session for course `id`; documents and published products are immutable snapshots. */
export function createCourseProject(materials: SurfaceMaterialCatalog, id: string) {
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
      return state.source ? courseSuccess(JSON.stringify(state.source)) : noSource();
    },
    async compile(
      assetSources: readonly CourseAssetBytes[] = [],
      document = '',
    ): Promise<ProjectResult<CompiledCourse>> {
      if (!state.source) return noSource();
      const ticket = ++generation;
      const result = await compileCourseDocument(state.source, id, assetSources, materials, document);
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
      const parsed = parseCourseDocument(text, document);
      if (!parsed.ok) return parsed;
      const ticket = ++generation;
      const result = await compileCourseDocument(parsed.value, id, assetSources, materials, document);
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

export function parseCourseDocument(text: string, document = ''): CourseResult<CourseDocument> {
  if (typeof text !== 'string') throw new TypeError('CourseDocument JSON must be a string');
  return readCourseDocumentBytes(new TextEncoder().encode(text), document);
}
