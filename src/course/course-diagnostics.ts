import { AdmissionError, type AdmissionCode, type AdmissionDiagnostic } from '../core/admission.js';

type CourseDiagnosticCode =
  | AdmissionCode
  | 'parse_failure'
  | 'invalid_shape'
  | 'unsupported_version'
  | 'unsupported_format'
  | 'duplicate_id'
  | 'unresolved_reference'
  | 'invalid_numeric_domain'
  | 'resource_limit'
  | 'unsupported_feature'
  | 'empty_course'
  | 'empty_section'
  | 'invalid_position'
  | 'invalid_plan'
  | 'invalid_boundary'
  | 'material_coverage_gap'
  | 'material_transition_discontinuity'
  | 'carriageway_transition_discontinuity'
  | 'plan_coordinate_inversion'
  | 'invalid_carriageway'
  | 'duplicate_membership'
  | 'invalid_height'
  | 'invalid_link'
  | 'seam_edge_mismatch'
  | 'seam_height_mismatch'
  | 'seam_grade_mismatch'
  | 'invalid_topology'
  | 'cycle_not_closed'
  | 'invalid_image_role'
  | 'invalid_strip'
  | 'invalid_appearance'
  | 'invalid_placement'
  | 'invalid_gate'
  | 'invalid_fork'
  | 'invalid_rules';

/** The shared admission diagnostic, with the course's semantic codes. */
type InputDiagnostic =
  | AdmissionDiagnostic<CourseDiagnosticCode>
  | (AdmissionDiagnostic<'plan_coordinate_overlap'> & {
      readonly overlap: {
        readonly section: string;
        readonly intervals: readonly { readonly sStart: number; readonly sEnd: number }[];
      };
    });

interface AssetDiagnostic {
  readonly kind: 'asset';
  readonly code:
    | 'asset_missing'
    | 'asset_duplicate'
    | 'asset_unreferenced'
    | 'asset_digest_mismatch'
    | 'asset_parse_failure'
    | 'asset_invalid_image'
    | 'resource_limit';
  readonly sha256: string;
  /** Document asset declarations sharing this saved source; empty for unreferenced input. */
  readonly assetIndices: readonly number[];
  readonly inputIndex?: number;
  /** JSON Pointer into the image source, for `asset_invalid_image`. */
  readonly path?: string;
  readonly message: string;
}

type CourseDiagnostic = InputDiagnostic | AssetDiagnostic;

/** Expected saved-asset admission failure, separately addressed from document JSON pointers. */
export class CourseAssetError extends Error {
  readonly diagnostic: AssetDiagnostic;

  constructor(
    code: AssetDiagnostic['code'],
    sha256: string,
    assetIndices: readonly number[],
    message: string,
    inputIndex?: number,
    path?: string,
  ) {
    super(message);
    this.diagnostic = Object.freeze({
      kind: 'asset',
      code,
      sha256,
      assetIndices: Object.freeze([...assetIndices]),
      message,
      ...(inputIndex === undefined ? {} : { inputIndex }),
      ...(path === undefined ? {} : { path }),
    });
  }
}

export type CourseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly CourseDiagnostic[] };

/** The shared admission error with the course's semantic codes and optional diagnostic detail. */
export class CourseInputError extends AdmissionError<CourseDiagnosticCode | 'plan_coordinate_overlap'> {
  readonly diagnostic: InputDiagnostic;

  constructor(diagnostic: InputDiagnostic);
  constructor(code: CourseDiagnosticCode, path: string, message: string);
  constructor(code: CourseDiagnosticCode | InputDiagnostic, path = '', message = '') {
    const diagnostic: InputDiagnostic = Object.freeze(
      typeof code === 'string' ? { kind: 'input' as const, code, document: '', path, message } : code,
    );
    super(diagnostic.code, diagnostic.path, diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

/** Any admission error, including the shared shape readers', as one course failure. */
export function courseFailure(error: AdmissionError<string>, document = '') {
  return courseFailures(
    [
      error instanceof CourseInputError
        ? error
        : new CourseInputError(error.code as CourseDiagnosticCode, error.path, error.message),
    ],
    document,
  );
}

/** Independent admission failures in deterministic input order; never a partial product. */
export function courseFailures(errors: readonly { readonly diagnostic: CourseDiagnostic }[], document = '') {
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze(
      errors.map(({ diagnostic }) =>
        diagnostic.kind === 'input' && document ? Object.freeze({ ...diagnostic, document }) : diagnostic,
      ),
    ),
  });
}

export function requireCourse(
  condition: boolean,
  path: string,
  message: string,
  code: CourseDiagnosticCode,
): asserts condition {
  if (!condition) throw new CourseInputError(code, path, message);
}

export function courseSuccess<T>(value: T) {
  return Object.freeze({ ok: true as const, value });
}
