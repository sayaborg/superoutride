import type { CourseResult } from '../../src/course/course-diagnostics.js';
import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';

/** A diagnostic a tool reports: a course's, a content load's, or the tool's own. */
export type AuthoringDiagnostic =
  | Extract<CourseResult<never>, { ok: false }>['diagnostics'][number]
  | ContentLoadDiagnostic
  | { kind: string; code: string; path?: string; message: string };

/** A tool's expected failure: its diagnostics, kept as structure. */
export class AuthoringError extends Error {
  readonly diagnostics: readonly AuthoringDiagnostic[];
  constructor(diagnostics: readonly AuthoringDiagnostic[], options?: { readonly cause?: unknown }) {
    super(diagnostics[0]?.message ?? 'Authoring failed', options);
    this.diagnostics = diagnostics;
  }
}

/** An input diagnostic at `location`, with the error that caused it, if any. */
export const inputError = (location: string, message: string, cause?: unknown) =>
  new AuthoringError([{ kind: 'tool', code: 'invalid_input', path: location, message }], { cause });

/** Fail with an input diagnostic at `location` unless `condition` holds. */
export function requireInput(condition: unknown, location: string, message: string, kind = 'tool'): asserts condition {
  if (!condition) throw new AuthoringError([{ kind, code: 'invalid_input', path: location, message }]);
}
