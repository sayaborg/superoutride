import path from 'node:path';
import { contentDigest } from '../../src/core/content-digest.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';

/** A course's identifier is its saved file name without the `.course.json` (or `.json`) extension. */
export function courseFileId(file: string): string {
  return path.basename(file).replace(/(\.course)?\.json$/, '');
}

/** The SHA-256 a course document has when delivered: the digest of its delivered JSON encoding. */
export function courseFileSha256(document: unknown): Promise<string> {
  return contentDigest(encodeContentJson(document));
}
