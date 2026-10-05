import type { ContentStore } from '../authoring/content-store.js';
import type { DeliveredFile } from '../authoring/compile-content.js';
import type { WorkbenchDiagnostic } from './compile-protocol.js';

/** The latest compile the workbench knows: its products, or its diagnostics with the last products that compiled. */
export type CompileState =
  | { readonly status: 'running'; readonly last: CompiledState | null }
  | { readonly status: 'ok'; readonly last: CompiledState }
  | {
      readonly status: 'failed';
      readonly diagnostics: readonly WorkbenchDiagnostic[];
      /** The last products that compiled, from an earlier state: stale. */
      readonly last: CompiledState | null;
    };

export interface CompiledState {
  /** The edit history step the products were compiled from. */
  readonly step: number;
  readonly seconds: number;
  readonly files: readonly DeliveredFile[];
}

/** What a workbench module receives: the store, the compile and the one edit. */
export interface WorkbenchContext {
  /** The authored files as they stand, published build and changes together; it reads only. */
  readonly store: ContentStore;
  /** The published build's commit. */
  readonly commit: string;
  compile(): CompileState;
  /** Replace the document at `path` with an admitted-or-not JSON value, saved in the saved layout: one edit. */
  replace(path: string, value: unknown, label?: string): void;
  /** Set a file's bytes, or delete it with null: one edit. */
  setFile(path: string, bytes: Uint8Array<ArrayBuffer> | null, label?: string): void;
  /** Called after every change of state: an edit, an undo or a compile. */
  subscribe(listener: () => void): () => void;
  /** Ask the documents module to show a document at a JSON Pointer. */
  reveal(document: string, pointer: string): void;
}

/** One screen of the workbench page. */
export interface WorkbenchModule {
  readonly id: string;
  readonly title: string;
  mount(element: HTMLElement, context: WorkbenchContext): void;
  /** Show a document at a JSON Pointer, when the module shows documents. */
  reveal?(document: string, pointer: string): void;
}
