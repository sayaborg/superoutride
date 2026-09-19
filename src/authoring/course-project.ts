import { CourseInputError, courseFailure, courseSuccess, type CourseResult } from '../course/course-diagnostics.js';
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

/** Live authoring session; documents and published products themselves are immutable snapshots. */
export function createCourseProject() {
  let state: CourseProjectState = Object.freeze({ source: null, compiled: null, lastSuccessful: null });
  let generation = 0;
  const noSource = () =>
    courseFailure<never>(new CourseInputError('semantic_compile_failure', '', 'No CourseDocument is loaded'));
  const stale = () =>
    courseFailure<never>(
      new CourseInputError('stale_source', '', 'Source changed or a newer operation superseded this build'),
    );
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
    save(): CourseResult<string> {
      return state.source ? saveCourseDocument(state.source) : noSource();
    },
    async compile(): Promise<CourseResult<CompiledCourse>> {
      if (!state.source) return noSource();
      const ticket = ++generation;
      const result = await compileCourseDocument(state.source);
      if (ticket !== generation) return stale();
      if (result.ok)
        state = Object.freeze({ source: state.source, compiled: result.value, lastSuccessful: result.value });
      return result;
    },
    async importDocument(text: string): Promise<CourseResult<CompiledCourse>> {
      const ticket = ++generation;
      const parsed = parseCourseDocument(text);
      if (!parsed.ok) return parsed;
      const result = await compileCourseDocument(parsed.value);
      if (ticket !== generation) return stale();
      if (result.ok)
        state = Object.freeze({ source: parsed.value, compiled: result.value, lastSuccessful: result.value });
      return result;
    },
    exportCompiled(): CourseResult<CompiledCourse> {
      return state.compiled ? courseSuccess(state.compiled) : stale();
    },
  });
}
