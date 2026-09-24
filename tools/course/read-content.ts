import { readFile } from 'node:fs/promises';
import { loadContentManifest } from '../../src/core/content-manifest.js';

export function readDeliveredContent() {
  return loadContentManifest(new URL('../../dist/content/', import.meta.url), readFile);
}
