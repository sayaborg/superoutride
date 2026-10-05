import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';
import type { DeliveredFile } from '../authoring/compile-content.js';

/** One compile of the published build's authored files under `changes`, numbered by its generation. */
export interface CompileRequest {
  readonly generation: number;
  /** The build's `authored/` directory. */
  readonly root: string;
  readonly changes: readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[];
}

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
    }
  | {
      readonly generation: number;
      readonly seconds: number;
      readonly ok: false;
      readonly diagnostics: readonly WorkbenchDiagnostic[];
    };
