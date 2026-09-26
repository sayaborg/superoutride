import { readFile } from 'node:fs/promises';
import { loadContentManifest } from '../../src/content/content-manifest.js';

export function readDeliveredContent() {
  return loadContentManifest(new URL('../../dist/delivery/', import.meta.url), readFile);
}
