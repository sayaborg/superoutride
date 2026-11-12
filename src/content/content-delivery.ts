import { contentDigest } from '../core/content-digest.js';
import { missingContent, requireLoaded, type ContentKind } from './content-load-error.js';
import { readContentManifest, type ContentEntry } from './content-manifest.js';
import type { DocumentSource } from './document-catalog.js';

/** How delivery reads bytes: `fetch` in browsers, a file read in Node. */
export type ContentTransport = (url: URL) => Promise<Uint8Array<ArrayBuffer>>;

async function fetchContentBytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Content request failed (${response.status}): ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The values of `promises`, which run at once; a failure is the first in their order, as if they had run one after
 * another.
 */
export async function inOrder<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  return settled.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

/** The manifest is the bootstrap index; every indexed payload is verified before decoding. */
export async function loadContentManifest(root: URL, transport: ContentTransport = fetchContentBytes) {
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  const manifest = requireLoaded(readContentManifest(decode(await transport(new URL('manifest.json', root)))));
  // An entry's bytes, verified against its digest before anything decodes them.
  const verified = async (entry: ContentEntry) => {
    const data = await transport(new URL(entry.path, root));
    if ((await contentDigest(data)) !== entry.sha256) throw new Error(`Content digest mismatch: ${entry.path}`);
    return data;
  };
  const bytes = async (kind: ContentKind, id: string) => {
    const entry = manifest.files.find((file) => file.kind === kind && file.id === id);
    if (!entry) throw missingContent(kind, id);
    return verified(entry);
  };
  return Object.freeze({
    manifest,
    bytes,
    json: async (kind: ContentKind, id: string) => decode(await bytes(kind, id)),
    /**
     * Every file of `kind` as a document source, in manifest order: all are fetched at once, each is verified against
     * its own digest, then each is decoded in turn. The one form catalogs read their documents by.
     */
    async documents(kind: ContentKind): Promise<readonly DocumentSource[]> {
      const entries = manifest.files.filter((file) => file.kind === kind);
      const data = await inOrder(entries.map(verified));
      return Object.freeze(
        entries.map(({ id, path, sha256 }, index) => Object.freeze({ id, path, value: decode(data[index]!), sha256 })),
      );
    },
  });
}
export type ContentDelivery = Awaited<ReturnType<typeof loadContentManifest>>;
