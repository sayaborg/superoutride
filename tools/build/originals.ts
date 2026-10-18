import { readdir, readFile } from 'node:fs/promises';
import type { ContentStore } from '../authoring/content-store.js';

/**
 * Local originals ([Development](../../docs/development.md#local-originals)): assets converted from an original's ROMs,
 * each under `reference-media/originals/` at the path of the published file it replaces in a local build. Git ignores
 * the directory, so they never reach Git, a PR or Pages.
 */
export const ORIGINALS_ROOT = new URL('../../reference-media/originals/', import.meta.url);
/** The environment variable `npm run build:originals` sets for the build's steps. */
export const ORIGINALS_VARIABLE = 'SUPEROUTRIDE_ORIGINALS';
/** The file a build that used the originals writes beside its delivery, listing them; DEV reads it. */
export const ORIGINALS_INDEX = 'originals.json';

/** Whether this build uses the originals: asked for by `ORIGINALS_VARIABLE`, refused in CI. */
export function originalsRequested(): boolean {
  if (process.env[ORIGINALS_VARIABLE] !== '1') return false;
  if (process.env.CI) throw new Error('A CI build does not use the local originals');
  return true;
}

/** Every file under `directory` of the originals' root, its path from the root. */
async function filesUnder(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(new URL(directory, ORIGINALS_ROOT), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? filesUnder(`${directory}${entry.name}/`) : [`${directory}${entry.name}`],
    ),
  );
  return nested.flat().sort();
}

/**
 * The originals that replace published files: each file under the originals' root whose path `published` holds, by
 * that path. A file with no published counterpart is left out: the originals replace, they add nothing.
 */
export async function readOriginals(published: ContentStore): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const originals = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const path of await filesUnder('')) {
    const exists = await published.read(path).then(
      () => true,
      () => false,
    );
    if (exists) originals.set(path, new Uint8Array(await readFile(new URL(path, ORIGINALS_ROOT))));
  }
  return originals;
}
