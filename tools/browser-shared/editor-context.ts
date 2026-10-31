import type { ContentStore } from '../authoring/content-store.js';
import type { DeliveredFile } from '../authoring/compile-content.js';
import type { CourseQuery, QueryResponse, EditorDiagnostic } from './compile-protocol.js';

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
      readonly diagnostics: readonly EditorDiagnostic[];
      /** The last products that compiled, from an earlier state: stale. */
      readonly last: CompiledState | null;
      /** When only measured products are stale: this state's products without them. */
      readonly unmeasured: CompiledState | null;
    };

/** The working changes: each changed path's bytes, or null for a deleted file. */
export type Changes = ReadonlyMap<string, Uint8Array<ArrayBuffer> | null>;

export interface CompiledState {
  /** The edit history step the products were compiled from. */
  readonly step: number;
  readonly seconds: number;
  readonly files: readonly DeliveredFile[];
}

/** A file as a page read it: its bytes and the revision they are of, which an edit made from them carries. */
export interface ReadFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly revision: number;
}

/**
 * What a workbench module receives: the store, the compile and the one edit. Every edit carries, for each file, the
 * revision its content was made from (`readAt`): the revision a screen read the document it edits at (the open JSON,
 * the document a drag or a field began from), or for a file whose content it did not read (a chosen file, a new one)
 * the revision it found. Redrawing does not advance it, except past this page's own edits (`follows`), and an edit of a
 * file another page has written since is refused and said.
 */
export interface EditorContext {
  /** The authored files as they stand, published build and changes together; it reads only. */
  readonly store: ContentStore;
  /** The build's own authored files, without the changes. */
  readonly published: ContentStore;
  /** The build's working state: each changed path's bytes, or null for a deleted file. */
  changes(): ReadonlyMap<string, Uint8Array<ArrayBuffer> | null>;
  /** Every path the store holds, sorted. */
  paths(): readonly string[];
  /** Return a path to the build's own file: one edit. */
  revert(path: string, readAt: number): void;
  /** The published build's commit. */
  readonly commit: string;
  compile(): CompileState;
  /** The revision of `path` this page holds now (0 for the build's own file). */
  revision(path: string): number;
  /**
   * Whether revision `to` of `path` is `from`, or follows it by this page's own edits alone. A screen still holding a
   * reading at `from` (a field being edited) moves it on to a reading at `to`: what it shows is this page's own.
   */
  follows(path: string, from: number, to: number): boolean;
  /** Read a file with the revision it is of; rejects as `store.read` does for an absent file. */
  readFile(path: string): Promise<ReadFile>;
  /** Replace the document at `path` with an admitted-or-not JSON value, saved in the saved layout: one edit. */
  replace(path: string, value: unknown, readAt: number, label?: string): void;
  /** Set a file's bytes, or delete it with null: one edit. */
  setFile(path: string, bytes: Uint8Array<ArrayBuffer> | null, readAt: number, label?: string): void;
  /** Set several files' bytes (null deletes) as one edit: one step, undone together. */
  setFiles(files: readonly (readonly [string, Uint8Array<ArrayBuffer> | null, number])[], label: string): void;
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
export interface EditorModule {
  readonly id: string;
  readonly title: string;
  mount(element: HTMLElement, context: EditorContext): void;
  /** Show a document at a JSON Pointer, when the module shows documents. */
  reveal?(document: string, pointer: string): void;
}
