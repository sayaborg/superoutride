import type { ContentStore } from '../authoring/content-store.js';
import type { DeliveredFile } from '../authoring/compile-content.js';
import type { CourseQuery, QueryResponse, WorkbenchDiagnostic } from './compile-protocol.js';

/** The latest compile the workbench knows: its products, or its diagnostics with the last products that compiled. */
export type CompileState =
  | { readonly status: 'running'; readonly last: CompiledState | null }
  | {
      readonly status: 'ok';
      readonly last: CompiledState;
      /** Whether the measured products are the saved ones or the workbench's unsaved preview measurements. */
      readonly measurements: 'saved' | 'preview';
    }
  | {
      readonly status: 'failed';
      readonly diagnostics: readonly WorkbenchDiagnostic[];
      /** The last products that compiled, from an earlier state: stale. */
      readonly last: CompiledState | null;
      /** When only measured products are stale: this state's products without them. */
      readonly unmeasured: CompiledState | null;
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
  /** The build's own authored files, without the changes. */
  readonly published: ContentStore;
  /** The session's changes: each changed path's bytes, or null for a deleted file. */
  changes(): ReadonlyMap<string, Uint8Array<ArrayBuffer> | null>;
  /** Every path the store holds, sorted. */
  paths(): readonly string[];
  /** Return a path to the build's own file: one edit. */
  revert(path: string): void;
  /** The published build's commit. */
  readonly commit: string;
  compile(): CompileState;
  /** Replace the document at `path` with an admitted-or-not JSON value, saved in the saved layout: one edit. */
  replace(path: string, value: unknown, label?: string): void;
  /** Set a file's bytes, or delete it with null: one edit. */
  setFile(path: string, bytes: Uint8Array<ArrayBuffer> | null, label?: string): void;
  /** The preview measurements: saved-product files measured here, used while current, never saved or undone. */
  preview(): ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  /**
   * Ask about a compiled course: answered from the latest compile that succeeded, whose generation (the history step it
   * compiled) the answer carries.
   */
  query(query: CourseQuery): Promise<QueryResponse>;
  /** Add preview measurements and compile again. */
  addPreview(files: readonly (readonly [string, Uint8Array<ArrayBuffer>])[]): void;
  /** The published build's `authored/` directory, which workers open. */
  readonly root: string;
  /** Called after every change of state: an edit, an undo or a compile. */
  subscribe(listener: () => void): () => void;
  /** Ask the documents module to show a document at a JSON Pointer. */
  reveal(document: string, pointer: string): void;
  /** The one selection shared by the modules: a document and a JSON Pointer in it. */
  selection(): { readonly document: string; readonly pointer: string } | null;
  /** Select a place in a document; every module hears it. */
  select(document: string, pointer: string): void;
}

/** One screen of the workbench page. */
export interface WorkbenchModule {
  readonly id: string;
  readonly title: string;
  mount(element: HTMLElement, context: WorkbenchContext): void;
  /** Show a document at a JSON Pointer, when the module shows documents. */
  reveal?(document: string, pointer: string): void;
}
