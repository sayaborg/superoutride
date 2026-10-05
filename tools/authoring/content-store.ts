import { formatSavedJson } from '../../src/content/saved-json.js';

/**
 * The authored documents and files under `content/`, addressed by paths relative to it (`courses/<id>.course.json`).
 * Each platform supplies one implementation; the authoring core reads and edits through this shape alone.
 */
export interface ContentStore {
  /** The bytes saved at `path`; an absent file rejects with the platform's error. */
  read(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** The names of the files directly inside `directory`, sorted. */
  list(directory: string): Promise<readonly string[]>;
  /** Save `bytes` at `path`, replacing any file there. */
  write(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}

/**
 * The one edit: replace the document at `path` with an admitted value, saved in the repository's JSON layout. The
 * authoring core compiles the edited store again; selection, undo and views belong to its callers.
 */
export function replaceDocument(store: ContentStore, path: string, value: unknown): Promise<void> {
  return store.write(path, new TextEncoder().encode(formatSavedJson(value)));
}
