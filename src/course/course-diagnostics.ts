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
  | 'empty_course'
  | 'empty_section'
  | 'invalid_raster_geometry'
  | 'invalid_guide_geometry'
  | 'invalid_anchor'
  | 'invalid_boundary'
  | 'invalid_band_domain'
  | 'invalid_band_width'
  | 'band_coverage_gap'
  | 'band_overlap'
  | 'shared_boundary_required'
  | 'band_transition_discontinuity'
  | 'mapped_band_inversion'
  | 'invalid_carriageway'
  | 'duplicate_membership'
  | 'invalid_height'
  | 'physical_binding'
  | 'invalid_port'
  | 'invalid_link'
  | 'invalid_topology'
  | 'nonstraight_overlap'
  | 'invalid_overlap'
  | 'overlap_geometry_mismatch'
  | 'unrepresentable_overlap'
  | 'coverage_gap'
  | 'ambiguous_geometry'
  | 'nonhorizontal_overlap'
  | 'physical_height_mismatch'
  | 'physical_support_mismatch'
  | 'presentation_missing'
  | 'presentation_ground_mismatch'
  | 'presentation_phase_mismatch'
  | 'presentation_environment_mismatch'
  | 'presentation_scenery_mismatch'
  | 'appearance_binding'
  | 'invalid_image_role'
  | 'invalid_profile'
  | 'invalid_placement'
  | 'invalid_fork';

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

interface ForkQualificationDiagnostic {
  readonly kind: 'fork-qualification';
  readonly code: CourseDiagnosticCode;
  readonly sectionId: string;
  readonly consumer?: string;
  readonly message: string;
}

type CourseDiagnostic = InputDiagnostic | QualificationDiagnostic | AssetDiagnostic | ForkQualificationDiagnostic;

/** A compiled fork coverage failure; Section identity is not an authoring JSON Pointer. */
export class CourseForkQualificationError extends Error {
  readonly diagnostic: ForkQualificationDiagnostic;

  constructor(code: CourseDiagnosticCode, sectionId: string, message: string, consumer?: string) {
    super(message);
    this.diagnostic = Object.freeze({
      kind: 'fork-qualification',
      code,
      sectionId,
      message,
      ...(consumer === undefined ? {} : { consumer }),
    });
  }
}

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
  code: CourseDiagnosticCode,
): asserts condition {
  if (!condition) throw new CourseInputError(code, path, message);
}

export function courseSuccess<T>(value: T): CourseResult<T> {
  return Object.freeze({ ok: true, value });
}
