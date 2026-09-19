type CourseDiagnosticCode =
  | 'parse_failure'
  | 'invalid_shape'
  | 'unsupported_version'
  | 'unsupported_format'
  | 'unsupported_units'
  | 'duplicate_id'
  | 'unresolved_reference'
  | 'invalid_numeric_domain'
  | 'resource_limit'
  | 'unsupported_feature'
  | 'semantic_compile_failure'
  | 'coverage_gap'
  | 'nonhorizontal_overlap'
  | 'physical_height_mismatch'
  | 'physical_support_mismatch';

interface InputDiagnostic {
  readonly kind: 'input';
  readonly code: CourseDiagnosticCode;
  /** JSON Pointer into the submitted authoring input; empty means the root. */
  readonly path: string;
  readonly message: string;
}

interface QualificationDiagnostic {
  readonly kind: 'qualification';
  readonly code: CourseDiagnosticCode;
  readonly linkIndex: number;
  readonly consumer?: string;
  readonly message: string;
}

type CourseDiagnostic = InputDiagnostic | QualificationDiagnostic;

export type CourseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly CourseDiagnostic[] };

/** Internal control flow for expected authoring errors only. Other exceptions propagate. */
export class CourseInputError extends Error {
  readonly diagnostic: InputDiagnostic;

  constructor(code: CourseDiagnosticCode, path: string, message: string) {
    super(message);
    this.diagnostic = Object.freeze({ kind: 'input', code, path, message });
  }
}

/** A rule failure over compiled Link references, not a fabricated pointer into CourseDocument. */
export class CourseQualificationError extends Error {
  readonly diagnostic: QualificationDiagnostic;

  constructor(code: CourseDiagnosticCode, linkIndex: number, message: string, consumer?: string) {
    super(message);
    this.diagnostic = Object.freeze({
      kind: 'qualification',
      code,
      linkIndex,
      message,
      ...(consumer === undefined ? {} : { consumer }),
    });
  }
}

export function courseFailure<T>(error: CourseInputError): CourseResult<T> {
  return courseFailures([error]);
}

/** Independent admission failures in deterministic input order; never a partial product. */
export function courseFailures<T>(errors: readonly { readonly diagnostic: CourseDiagnostic }[]): CourseResult<T> {
  if (errors.length === 0) throw new Error('A failed admission must identify a cause');
  return Object.freeze({ ok: false, diagnostics: Object.freeze(errors.map((error) => error.diagnostic)) });
}

export function requireCourse(
  condition: boolean,
  path: string,
  message: string,
  code: CourseDiagnosticCode = 'semantic_compile_failure',
): asserts condition {
  if (!condition) throw new CourseInputError(code, path, message);
}

export function courseSuccess<T>(value: T): CourseResult<T> {
  return Object.freeze({ ok: true, value });
}
