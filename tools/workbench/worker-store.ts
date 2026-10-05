import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';

/** A worker's view of the workbench's store: the published build at `root` under `changes`. Bases are opened once. */
const bases = new Map<string, Promise<ContentStore>>();
export async function workerStore(
  root: string,
  changes: readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[],
): Promise<ContentStore> {
  let base = bases.get(root);
  if (!base) bases.set(root, (base = openPublishedStore(new URL(root)).then(({ store }) => store)));
  return createLayeredStore(await base, new Map(changes));
}
