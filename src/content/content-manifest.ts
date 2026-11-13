import { SHA256_TEXT } from '../core/content-digest.js';
import {
  admit,
  readArray,
  readDocument,
  readEnum,
  readNumber,
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
  /** The delivered file's length in bytes, by which progress counts what is read. */
  readonly size: number;
}
export interface ContentManifest {
  readonly format: 'superoutride.content-manifest';
  readonly version: 2;
  readonly files: readonly ContentEntry[];
}

const CONTENT_KINDS: readonly ContentKind[] = [
  'course',
  'course-index',
  'crest-trial',
  'series',
  'image',
  'explosion',
  'explosion-picture',
  'screen-picture',
  'reference-times',
  'schedule',
  'racing-line',
  'engine-loudness',
  'vehicle',
  'vehicle-listing',
  'vehicle-sprite-set',
  'driving',
  'material',
  'engine-sound',
  'surface-sound',
  'audio',
  'free-play',
  'front-end',
  'puffs',
  'puff-picture',
  'recording',
  'music',
];
const RELATIVE_PATH = {
  pattern: /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/,
  patternMessage: 'Expected a relative path of safe segments',
};

/** Admit the delivery index; each kind/id identity and each path appears once. */
export function readContentManifest(value: unknown): AdmissionResult<ContentManifest> {
  return admit('manifest.json', () => {
    const root = readDocument(value, ['format', 'version', 'files'], 'superoutride.content-manifest', 2);
    const identities = new Set<string>(),
      paths = new Set<string>();
    const files = readArray(root.files, '/files', (item, at) => {
      const entry = readRecord(item, at, ['kind', 'id', 'path', 'sha256', 'size']);
      const kind = readEnum(entry.kind, CONTENT_KINDS, `${at}/kind`);
      const id = readString(entry.id, `${at}/id`);
      const path = readString(entry.path, `${at}/path`, RELATIVE_PATH);
      const sha256 = readString(entry.sha256, `${at}/sha256`, SHA256_TEXT);
      const size = readNumber(entry.size, `${at}/size`, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true });
      const identity = JSON.stringify([kind, id]);
      requireAdmission(!identities.has(identity), 'duplicate_id', `${at}/id`, `Duplicate manifest entry ${kind} ${id}`);
      requireAdmission(!paths.has(path), 'duplicate_id', `${at}/path`, `Duplicate manifest path ${path}`);
      identities.add(identity);
      paths.add(path);
      return Object.freeze({ kind, id, path, sha256, size });
    });
    return Object.freeze({ format: 'superoutride.content-manifest' as const, version: 2 as const, files });
  });
}

/** The JSON value of a delivered JSON content file's bytes, which must be UTF-8. */
export const decodeContentJson = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;

/** The delivered encoding of every JSON content file: compact JSON followed by a newline. */
export function encodeContentJson(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value) + '\n');
}
