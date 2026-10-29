import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import type { ContentStore } from '../authoring/content-store.js';
import { readAuthoredIndex, type AuthoredIndex } from '../authoring/authored-index.js';

/**
 * The authored files a build published, read over HTTP from `root` (the build's `authored/` directory): the index lists
 * them, and each file's bytes are verified against its digest before use. It reads only. A request that fails is
 * not kept, so a later read can succeed.
 */
export async function openPublishedStore(root: URL): Promise<{ index: AuthoredIndex; store: ContentStore }> {
  const fetchBytes = async (url: URL) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Authored content request failed (${response.status}): ${url.pathname}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const indexUrl = new URL('index.json', root);
  const index = requireLoaded(
    readAuthoredIndex(JSON.parse(new TextDecoder().decode(await fetchBytes(indexUrl))), indexUrl.pathname),
  );
  const digests = new Map(index.files.map((file) => [file.path, file.sha256]));
  const cache = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  const read = (path: string) => {
    const sha256 = digests.get(path);
    if (!sha256) return Promise.reject(new Error(`Not authored content: ${path}`));
    let bytes = cache.get(path);
    if (!bytes) {
      bytes = fetchBytes(new URL(path, root)).then(async (data) => {
        if ((await contentDigest(data)) !== sha256) throw new Error(`Authored content digest mismatch: ${path}`);
        return data;
      });
      cache.set(path, bytes);
      // A failed read is not kept: the next read requests the file again.
      const failed = bytes;
      failed.catch(() => {
        if (cache.get(path) === failed) cache.delete(path);
      });
    }
    // Each reader receives its own copy; the cached bytes stay unchanged.
    return bytes.then((data) => data.slice());
  };
  const store: ContentStore = Object.freeze({
    read,
    list: async (directory: string) =>
      index.files
        .map((file) => file.path)
        .filter((path) => path.startsWith(`${directory}/`) && !path.slice(directory.length + 1).includes('/'))
        .map((path) => path.slice(directory.length + 1)),
    write: () => Promise.reject(new Error('A published build reads only')),
  });
  return { index, store };
}
