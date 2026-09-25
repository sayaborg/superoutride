import { contentDigest } from './content-digest.js';

export type ContentKind = 'course' | 'image' | 'envelope' | 'budget' | 'vehicle' | 'driving' | 'material';
export interface ContentEntry {
  readonly kind: ContentKind;
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
}
export interface ContentManifest {
  readonly format: 'superoutride.content-manifest';
  readonly version: 1;
  readonly files: readonly ContentEntry[];
}
export type ContentTransport = (url: URL) => Promise<Uint8Array<ArrayBuffer>>;

export function readContentManifest(value: unknown): ContentManifest {
  const manifest = value as Partial<ContentManifest> | null;
  if (manifest?.format !== 'superoutride.content-manifest' || manifest.version !== 1)
    throw new RangeError('Unsupported content manifest format/version');
  if (!Array.isArray(manifest.files)) throw new TypeError('Manifest files must be an array');
  const identities = new Set<string>(),
    paths = new Set<string>();
  const files = manifest.files.map((value: unknown) => {
    const entry = value as Partial<ContentEntry> | null;
    if (
      !entry ||
      !['course', 'image', 'envelope', 'budget', 'vehicle', 'driving', 'material'].includes(entry.kind!) ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      entry.id.trim() !== entry.id ||
      typeof entry.path !== 'string' ||
      typeof entry.sha256 !== 'string'
    )
      throw new TypeError('Invalid manifest entry');
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !entry.path.split('/').every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))
    )
      throw new RangeError('Manifest entries require a relative path and lowercase SHA-256');
    const identity = JSON.stringify([entry.kind, entry.id]);
    if (identities.has(identity) || paths.has(entry.path)) throw new RangeError('Duplicate manifest entry');
    identities.add(identity);
    paths.add(entry.path);
    return Object.freeze({ kind: entry.kind!, id: entry.id, path: entry.path, sha256: entry.sha256 });
  });
  return Object.freeze({ format: 'superoutride.content-manifest', version: 1, files: Object.freeze(files) });
}

export async function fetchContentBytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Content request failed (${response.status}): ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The manifest is the bootstrap index; every indexed payload is verified before decoding. */
export async function loadContentManifest(root: URL, transport: ContentTransport = fetchContentBytes) {
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  const manifest = readContentManifest(decode(await transport(new URL('manifest.json', root))));
  const bytes = async (kind: ContentKind, id: string) => {
    const entry = manifest.files.find((file) => file.kind === kind && file.id === id);
    if (!entry) throw new RangeError(`Content not listed in manifest: ${kind} ${id}`);
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
