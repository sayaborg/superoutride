type CourseDiagnosticCode =
  | 'parse_failure'
  | 'invalid_shape'
  | 'unsupported_version'
  | 'duplicate_id'
  | 'unresolved_reference'
  | 'invalid_numeric_domain'
  | 'resource_limit'
  | 'unsupported_feature'
  | 'semantic_compile_failure'
  | 'stale_source';

interface CourseDiagnostic {
  readonly code: CourseDiagnosticCode;
  /** JSON Pointer into the submitted document; empty means the root. */
  readonly path: string;
  readonly message: string;
}

export type CourseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly CourseDiagnostic[] };

/** Internal control flow for expected authoring errors only. Other exceptions propagate. */
export class CourseInputError extends Error {
  readonly diagnostic: CourseDiagnostic;

  constructor(code: CourseDiagnosticCode, path: string, message: string) {
    super(message);
    this.diagnostic = Object.freeze({ code, path, message });
  }
}

export function courseFailure<T>(error: CourseInputError): CourseResult<T> {
  return Object.freeze({ ok: false, diagnostics: Object.freeze([error.diagnostic]) });
}

export function courseSuccess<T>(value: T): CourseResult<T> {
  return Object.freeze({ ok: true, value });
}
