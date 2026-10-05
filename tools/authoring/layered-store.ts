import type { ContentStore } from './content-store.js';

/** Changes over a content store: each changed path's bytes, or null where a file is deleted. */
export type ContentChanges = ReadonlyMap<string, Uint8Array<ArrayBuffer> | null>;

/** The directory part of a path under `content/`, empty at the root. */
function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * A content store seen through changes: a changed path reads its new bytes, a deleted one reads as absent, every other
 * path reads from `base`. Writes go to `changes`, which the caller owns.
 */
export function createLayeredStore(
  base: ContentStore,
  changes: Map<string, Uint8Array<ArrayBuffer> | null>,
): ContentStore {
  return Object.freeze({
    async read(path: string) {
      const changed = changes.get(path);
      if (changed === null) throw new Error(`Deleted content: ${path}`);
      return changed ?? base.read(path);
    },
    async list(directory: string) {
      const names = new Set(await base.list(directory));
      for (const [path, bytes] of changes) {
        if (directoryOf(path) !== directory) continue;
        const name = path.slice(directory.length + 1);
        if (bytes === null) names.delete(name);
        else names.add(name);
      }
      return [...names].sort();
    },
    async write(path: string, bytes: Uint8Array<ArrayBuffer>) {
      changes.set(path, bytes);
    },
  });
}
