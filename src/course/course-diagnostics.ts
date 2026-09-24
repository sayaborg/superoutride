type CourseDiagnosticCode =
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
  | 'appearance_binding'
  | 'invalid_image_role'
  | 'invalid_profile'
  | 'invalid_placement'
  | 'invalid_gate'
  | 'invalid_fork'
  | 'invalid_rules';

interface BasicInputDiagnostic {
  readonly kind: 'input';
  readonly code: CourseDiagnosticCode;
  /** JSON Pointer into the submitted authoring input; empty means the root. */
  readonly path: string;
  readonly message: string;
}

type InputDiagnostic =
  | BasicInputDiagnostic
  | {
      readonly kind: 'input';
      readonly code: 'plan_coordinate_overlap';
      readonly path: string;
      readonly message: string;
      readonly overlap: {
        readonly section: string;
        readonly intervals: readonly { readonly sStart: number; readonly sEnd: number }[];
      };
    };

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
  ) {
    super(message);
    this.diagnostic = Object.freeze({
      kind: 'asset',
      code,
      sha256,
      assetIndices: Object.freeze([...assetIndices]),
      message,
      ...(inputIndex === undefined ? {} : { inputIndex }),
    });
  }
}

export type CourseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly CourseDiagnostic[] };

/** Internal control flow for expected authoring errors only. Other exceptions propagate. */
export class CourseInputError extends Error {
  readonly diagnostic: InputDiagnostic;

  constructor(diagnostic: InputDiagnostic);
  constructor(code: CourseDiagnosticCode, path: string, message: string);
  constructor(code: CourseDiagnosticCode | InputDiagnostic, path = '', message = '') {
    super(typeof code === 'string' ? message : code.message);
    this.diagnostic = Object.freeze(typeof code === 'string' ? { kind: 'input' as const, code, path, message } : code);
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
  code: CourseDiagnosticCode,
): asserts condition {
  if (!condition) throw new CourseInputError(code, path, message);
}

export function courseSuccess<T>(value: T): CourseResult<T> {
  return Object.freeze({ ok: true, value });
}

/** Gate shape, references and geometry share one author-facing code. Internal faults still propagate. */
export function admitGate<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof CourseInputError)
      throw new CourseInputError('invalid_gate', error.diagnostic.path, error.message);
    throw error;
  }
}
