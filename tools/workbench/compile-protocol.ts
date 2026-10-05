import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';
import type { DeliveredFile } from '../authoring/compile-content.js';

/** One compile of the published build's authored files under `changes`, numbered by its generation. */
export interface CompileRequest {
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

export type CompileResponse =
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
    };
