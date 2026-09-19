import { courseSuccess, type CourseResult } from '../course/course-diagnostics.js';
import {
  parseCourseDocument,
  readCourseDocument,
  saveCourseDocument,
  type CourseDocument,
} from '../course/course-document.js';
import { compileCourseDocument, type CompiledCourse } from '../compiler/compiled-course.js';

interface CourseProjectState {
  readonly source: CourseDocument | null;
  readonly compiled: CompiledCourse | null;
  /** Retained for comparison/recovery, never returned by exportCompiled after an edit. */
  readonly lastSuccessful: CompiledCourse | null;
}
type ProjectFailure = { readonly ok: false; readonly reason: 'no_source' | 'stale_source' };
type ProjectResult<T> = CourseResult<T> | ProjectFailure;

/** Live authoring session; documents and published products themselves are immutable snapshots. */
export function createCourseProject() {
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
    async compile(): Promise<ProjectResult<CompiledCourse>> {
      if (!state.source) return noSource();
      const ticket = ++generation;
      const result = await compileCourseDocument(state.source);
      if (ticket !== generation) return stale();
      if (result.ok)
        state = Object.freeze({ source: state.source, compiled: result.value, lastSuccessful: result.value });
      return result;
    },
    async importDocument(text: string): Promise<ProjectResult<CompiledCourse>> {
      const parsed = parseCourseDocument(text);
      if (!parsed.ok) return parsed;
      const ticket = ++generation;
      const result = await compileCourseDocument(parsed.value);
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
