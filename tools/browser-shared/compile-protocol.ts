import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';
import type { DeliveredFile } from '../authoring/compile-content.js';
import type { CourseFrame, CourseReport } from '../authoring/course-views.js';
import type { CourseFinding, FindingOptions } from '../authoring/course-findings.js';
import type { CleaningCandidate, CleaningRequest } from '../authoring/course-cleaning.js';

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

export type EditorDiagnostic = ContentLoadDiagnostic | InternalDiagnostic;

/** A delivered file as the page lists it: its kind, id, size in bytes and SHA-256. */
export interface ProductRow {
  readonly kind: string;
  readonly id: string;
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * A compile's outcome. It carries the delivered series documents (which the runs' classes read) and a row for each
 * delivered file; the delivery itself stays in the worker until a run asks for it (`DeliveryRequest`), so a compile
 * never moves the whole delivery onto the page's thread.
 */
export type CompileResponse = { readonly type: 'compiled' } & (
  | {
      readonly generation: number;
      readonly seconds: number;
      readonly ok: true;
      readonly series: readonly DeliveredFile[];
      readonly products: readonly ProductRow[];
      readonly measurements: Exclude<MeasurementSource, 'stale'>;
      /** The preview files still current; the others are discarded. */
      readonly preview: readonly string[];
    }
  | {
      readonly generation: number;
      readonly seconds: number;
      readonly ok: false;
      readonly diagnostics: readonly EditorDiagnostic[];
      /** When only measured products are stale: the series documents of every product except them. */
      readonly unmeasured: readonly DeliveredFile[] | null;
      readonly preview: readonly string[];
    }
);

/** The delivery of the compile of `generation`: what a run lays out for the game. */
export interface DeliveryRequest {
  readonly type: 'delivery';
  readonly id: number;
  readonly generation: number;
}

/**
 * The delivered files of the compile asked for (the products without the stale measured ones when only those were
 * stale), transferred; null when the worker has answered a later compile since.
 */
export interface DeliveryResponse {
  readonly type: 'delivery';
  readonly id: number;
  readonly files: readonly DeliveredFile[] | null;
}

/**
 * A view of a compiled course: a Section's numeric report, or the game's frame at a position; or a course document's
 * findings or cleaning candidates, worked out off the page's thread from the document sent, compiled or not.
 */
export type CourseQuery =
  | ({ readonly kind: 'findings'; readonly document: unknown } & FindingOptions)
  | { readonly kind: 'candidates'; readonly document: unknown; readonly request: CleaningRequest }
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
  | { readonly kind: 'candidates'; readonly candidates: CleaningCandidate[] }
  | { readonly kind: 'failed'; readonly message: string }
);
