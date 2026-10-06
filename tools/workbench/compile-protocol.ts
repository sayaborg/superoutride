import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';
import type { DeliveredFile } from '../authoring/compile-content.js';
import type { CourseFrame, CourseReport } from '../authoring/course-views.js';
import type { CourseFinding, FindingOptions } from '../authoring/course-findings.js';

/** One compile of the published build's authored files under `changes`, numbered by its generation. */
export interface CompileRequest {
  readonly type: 'compile';
  readonly generation: number;
  /** The build's `authored/` directory. */
  readonly root: string;
  readonly changes: readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[];
  /** Preview measurements: saved-product files the workbench measured, used only while current and never saved. */
  readonly preview: readonly (readonly [string, Uint8Array<ArrayBuffer>])[];
}

/** Which measured products a compile used: the saved ones, the preview's, or none because they are stale. */
export type MeasurementSource = 'saved' | 'preview' | 'stale';

/** An unexpected failure, shown with the admission diagnostics. */
export interface InternalDiagnostic {
  readonly kind: 'internal';
  readonly code: 'internal_error';
  readonly document: '';
  readonly path: '';
  readonly message: string;
}

export type WorkbenchDiagnostic = ContentLoadDiagnostic | InternalDiagnostic;

export type CompileResponse = { readonly type: 'compiled' } & (
  | {
      readonly generation: number;
      readonly seconds: number;
      readonly ok: true;
      readonly files: readonly DeliveredFile[];
      readonly measurements: Exclude<MeasurementSource, 'stale'>;
      /** The preview files still current; the others are discarded. */
      readonly preview: readonly string[];
    }
  | {
      readonly generation: number;
      readonly seconds: number;
      readonly ok: false;
      readonly diagnostics: readonly WorkbenchDiagnostic[];
      /** When only measured products are stale: every product except them. */
      readonly unmeasured: readonly DeliveredFile[] | null;
      readonly preview: readonly string[];
    }
);

/**
 * A view of a compiled course: a Section's numeric report, or the game's frame at a position; or a course document's
 * findings, worked out off the page's thread from the document sent, compiled or not.
 */
export type CourseQuery =
  | ({ readonly kind: 'findings'; readonly document: unknown } & FindingOptions)
  | { readonly kind: 'report'; readonly course: string; readonly section: string; readonly step: number }
  | {
      readonly kind: 'render';
      readonly course: string;
      readonly section: string;
      readonly s: number;
      readonly l: number;
      /** A catalog vehicle, or the first. */
      readonly vehicle: string | null;
    };

/** A query, answered from the latest compile that succeeded. */
export interface QueryRequest {
  readonly type: 'query';
  readonly id: number;
  readonly query: CourseQuery;
}

/**
 * A query's answer, with the generation of the compile it came from, so an older answer never replaces a newer one's,
 * and the milliseconds the worker took. A query before any compile succeeded, or outside its domain, has a message.
 */
export type QueryResponse = {
  readonly type: 'answer';
  readonly id: number;
  readonly generation: number | null;
  readonly milliseconds: number;
} & (
  | { readonly kind: 'report'; readonly report: CourseReport }
  | { readonly kind: 'render'; readonly frame: Omit<CourseFrame, 'stats'> }
  | { readonly kind: 'findings'; readonly findings: readonly CourseFinding[] }
  | { readonly kind: 'failed'; readonly message: string }
);
