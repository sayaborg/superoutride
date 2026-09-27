import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { contentDigest } from '../core/content-digest.js';
import { encodeContentJson } from './content-manifest.js';

/**
 * One document: its identifier (the file name, which is also its manifest ID), path, value and the
 * SHA-256 of its delivered bytes. Delivery takes the digest from the manifest entry.
 */
export interface DocumentSource {
  readonly id: string;
  readonly path: string;
  readonly value: unknown;
  readonly sha256: string;
}

/** A source read from an authored file; the build delivers exactly `encodeContentJson(value)`. */
export async function authoredDocumentSource(id: string, path: string, value: unknown): Promise<DocumentSource> {
  return Object.freeze({ id, path, value, sha256: await contentDigest(encodeContentJson(value)) });
}

/** The single-document rule: exactly one source, named `id`. A failure names the extra or misnamed source. */
export function admitSingleDocument(
  sources: readonly DocumentSource[],
  id: string,
  kind: string,
): AdmissionResult<DocumentSource> {
  const other = sources.find((source) => source.id !== id) ?? sources[1];
  return admit(other?.path ?? '', () => {
    requireAdmission(sources.length === 1 && !other, 'invalid_value', '', `Expected exactly one ${kind}, named ${id}`);
    return sources[0]!;
  });
}
