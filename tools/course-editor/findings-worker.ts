import {
  cleaningCandidates,
  sameValueGroups,
  withShifts,
  type CleaningCandidate,
  type CleaningProposal,
  type CleaningRequest,
} from '../authoring/course-cleaning.js';
import { courseFindings, type CourseFinding, type FindingOptions } from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';

/**
 * A search of a course document, sent as its text (parsed here, off the page's thread), asked of a search worker: its
 * findings with the step and tolerances to find them with, a cleaning operation's candidates, the shifts of
 * proposals (a finding's candidate shown in Clean), or what is written alike.
 */
export type SearchRequest = { readonly text: string } & (
  | ({ readonly kind: 'findings' } & FindingOptions)
  | { readonly kind: 'candidates'; readonly request: CleaningRequest }
  | { readonly kind: 'shifts'; readonly proposals: readonly CleaningProposal[] }
  | { readonly kind: 'same' }
);

/** A search's answer: its findings, candidates or groups and the milliseconds it took, or why it failed (`error`). */
export interface SearchAnswer {
  readonly id: number;
  readonly findings?: readonly CourseFinding[];
  readonly candidates?: readonly CleaningCandidate[];
  readonly groups?: ReturnType<typeof sameValueGroups>;
  readonly milliseconds?: number;
  readonly error?: string;
}

// The course editor's searches, off the page's thread and apart from the compile: one request at a time. The page
// stops a request overtaken by a newer one by ending this worker, so no answer of an older document comes back.
self.addEventListener('message', ({ data }: MessageEvent<SearchRequest & { readonly id: number }>) => {
  const started = performance.now();
  try {
    const document = JSON.parse(data.text) as Json;
    const answer =
      data.kind === 'findings'
        ? { findings: courseFindings(document, data) }
        : data.kind === 'candidates'
          ? { candidates: cleaningCandidates(document, data.request) }
          : data.kind === 'shifts'
            ? { candidates: withShifts(document, data.proposals) }
            : { groups: sameValueGroups(document) };
    self.postMessage({ id: data.id, ...answer, milliseconds: performance.now() - started } satisfies SearchAnswer);
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies SearchAnswer);
  }
});
