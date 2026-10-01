import { contentDigest, SHA256_TEXT } from '../core/content-digest.js';
import {
  admit,
  readArray,
  readDocument,
  readEnum,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { missingContent, requireLoaded, type ContentKind } from './content-load-error.js';

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

const CONTENT_KINDS: readonly ContentKind[] = [
  'course',
  'series',
  'image',
  'envelope',
  'budget',
  'vehicle',
  'vehicle-listing',
  'driving',
  'material',
  'engine-sound',
  'surface-sound',
  'audio',
];
const RELATIVE_PATH = {
  pattern: /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/,
  patternMessage: 'Expected a relative path of safe segments',
};

/** Admit the delivery index; each kind/id identity and each path appears once. */
export function readContentManifest(value: unknown): AdmissionResult<ContentManifest> {
  return admit('manifest.json', () => {
    const root = readDocument(value, ['format', 'version', 'files'], 'superoutride.content-manifest', 1);
    const identities = new Set<string>(),
      paths = new Set<string>();
    const files = readArray(root.files, '/files', (item, at) => {
      const entry = readRecord(item, at, ['kind', 'id', 'path', 'sha256']);
      const kind = readEnum(entry.kind, CONTENT_KINDS, `${at}/kind`);
      const id = readString(entry.id, `${at}/id`);
      const path = readString(entry.path, `${at}/path`, RELATIVE_PATH);
      const sha256 = readString(entry.sha256, `${at}/sha256`, SHA256_TEXT);
      const identity = JSON.stringify([kind, id]);
      requireAdmission(!identities.has(identity), 'duplicate_id', `${at}/id`, `Duplicate manifest entry ${kind} ${id}`);
      requireAdmission(!paths.has(path), 'duplicate_id', `${at}/path`, `Duplicate manifest path ${path}`);
      identities.add(identity);
      paths.add(path);
      return Object.freeze({ kind, id, path, sha256 });
    });
    return Object.freeze({ format: 'superoutride.content-manifest' as const, version: 1 as const, files });
  });
}

/** The delivered encoding of every JSON content file: compact JSON followed by a newline. */
export function encodeContentJson(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value) + '\n');
}

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
