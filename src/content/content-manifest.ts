import { SHA256_TEXT } from '../core/content-digest.js';
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
import type { ContentKind } from './content-load-error.js';

/**
 * The content manifest's saved format: its entries, its admission and the delivered JSON encoding. It knows no
 * transport; delivery (`content-delivery.ts`) fetches and verifies what it indexes.
 */
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

const CONTENT_KINDS: readonly ContentKind[] = [
  'course',
  'course-index',
  'series',
  'image',
  'envelope',
  'budget',
  'schedule',
  'vehicle',
  'vehicle-listing',
  'driving',
  'material',
  'engine-sound',
  'surface-sound',
  'audio',
  'free-play',
  'recording',
  'music',
  'wall-sound',
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
