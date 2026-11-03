import { courseFindings, type CourseFinding, type FindingOptions } from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';

/** A course document's findings asked of the findings worker, with the step and tolerances to find them with. */
export interface FindingsRequest extends FindingOptions {
  readonly id: number;
  readonly document: unknown;
}

/** The findings of a request, or why they could not be found (`error`). */
export interface FindingsAnswer {
  readonly id: number;
  readonly findings?: readonly CourseFinding[];
  readonly error?: string;
}

// The course editor's findings, off the page's thread and apart from the compile: one request at a time. The page
// stops a request overtaken by a newer one by ending this worker, so no answer of an older document comes back.
self.addEventListener('message', ({ data }: MessageEvent<FindingsRequest>) => {
  const { id, document, ...options } = data;
  try {
    self.postMessage({ id, findings: courseFindings(document as Json, options) } satisfies FindingsAnswer);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies FindingsAnswer);
  }
});
