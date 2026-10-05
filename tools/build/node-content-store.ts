import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ContentStore } from '../authoring/content-store.js';

/** The repository's `content/` directory. */
export const CONTENT_ROOT = new URL('../../content/', import.meta.url);

/** The content store over a directory of the file system; a write replaces its file atomically. */
export function createNodeContentStore(root: URL = CONTENT_ROOT): ContentStore {
  return Object.freeze({
    read: async (path: string) => new Uint8Array(await readFile(new URL(path, root))),
    async list(directory: string) {
      try {
        return (await readdir(new URL(`${directory}/`, root), { withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    },
    async write(path: string, bytes: Uint8Array<ArrayBuffer>) {
      const target = new URL(path, root),
        temporary = new URL(`${path}.${randomUUID()}.tmp`, root);
      await mkdir(new URL('./', target), { recursive: true });
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  });
}
