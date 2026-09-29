import type { AdmissionDiagnostic } from '../core/admission.js';
import type { CourseDiagnostic } from '../course/course-diagnostics.js';

/** The kinds of delivered content; the manifest indexes them and missing content names one. */
export type ContentKind =
  | 'course'
  | 'image'
  | 'envelope'
  | 'budget'
  | 'vehicle'
  | 'vehicle-listing'
  | 'driving'
  | 'material'
  | 'engine-sound'
  | 'surface-sound';

/** A required delivered or built file is absent from the content manifest. */
export interface MissingContentDiagnostic {
  readonly kind: 'missing';
  readonly code: 'content_missing';
  /** The index that lacks the entry. */
  readonly document: 'manifest.json';
  readonly contentKind: ContentKind;
  readonly id: string;
  readonly message: string;
}

export type ContentLoadDiagnostic = AdmissionDiagnostic<string> | CourseDiagnostic | MissingContentDiagnostic;

/**
 * An expected content or build error met while loading: the admission diagnostics, kept as structure.
 * Its message is their JSON text, so displays that print the message are unchanged.
 */
export class ContentLoadError extends Error {
  readonly diagnostics: readonly ContentLoadDiagnostic[];

  constructor(diagnostics: readonly ContentLoadDiagnostic[]) {
    super(JSON.stringify(diagnostics));
    this.name = 'ContentLoadError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

/** The loaded value, or a ContentLoadError carrying the result's diagnostics. */
export function requireLoaded<T>(
  result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly diagnostics: readonly ContentLoadDiagnostic[] },
): T {
  if (!result.ok) throw new ContentLoadError(result.diagnostics);
  return result.value;
}

export function missingContent(contentKind: ContentKind, id: string): ContentLoadError {
  return new ContentLoadError([
    Object.freeze({
      kind: 'missing',
      code: 'content_missing',
      document: 'manifest.json',
      contentKind,
      id,
      message: `Content not listed in manifest: ${contentKind} ${id}`,
    }),
  ]);
}
