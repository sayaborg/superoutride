import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';

/**
 * A worker's view of the workbench's store: the published build at `root` under `changes`. Bases are opened once; one
 * that fails to open is opened again by the next compile.
 */
const bases = new Map<string, Promise<ContentStore>>();
export async function workerStore(
  root: string,
  changes: readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[],
): Promise<ContentStore> {
  let base = bases.get(root);
  if (!base) {
    const opening = openPublishedStore(new URL(root)).then(({ store }) => store);
    bases.set(root, (base = opening));
    opening.catch(() => {
      if (bases.get(root) === opening) bases.delete(root);
    });
  }
  return createLayeredStore(await base, new Map(changes));
}
