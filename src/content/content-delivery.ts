import { contentDigest } from '../core/content-digest.js';
import { missingContent, requireLoaded, type ContentKind } from './content-load-error.js';
import { readContentManifest } from './content-manifest.js';

/** How delivery reads bytes: `fetch` in browsers, a file read in Node. */
export type ContentTransport = (url: URL) => Promise<Uint8Array<ArrayBuffer>>;

async function fetchContentBytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Content request failed (${response.status}): ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The manifest is the bootstrap index; every indexed payload is verified before decoding. */
export async function loadContentManifest(root: URL, transport: ContentTransport = fetchContentBytes) {
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  const manifest = requireLoaded(readContentManifest(decode(await transport(new URL('manifest.json', root)))));
  const bytes = async (kind: ContentKind, id: string) => {
    const entry = manifest.files.find((file) => file.kind === kind && file.id === id);
    if (!entry) throw missingContent(kind, id);
    const data = await transport(new URL(entry.path, root));
    if ((await contentDigest(data)) !== entry.sha256) throw new Error(`Content digest mismatch: ${entry.path}`);
    return data;
  };
  return Object.freeze({
    manifest,
    bytes,
    json: async (kind: ContentKind, id: string) => decode(await bytes(kind, id)),
  });
}
export type ContentDelivery = Awaited<ReturnType<typeof loadContentManifest>>;
