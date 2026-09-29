import { mkdir, writeFile } from 'node:fs/promises';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded, type ContentKind } from '../../src/content/content-load-error.js';
import { encodeContentJson, readContentManifest, type ContentEntry } from '../../src/content/content-manifest.js';

function contentPath(kind: ContentKind, id: string, sha256: string): string {
  switch (kind) {
    case 'vehicle':
      return `vehicles/${id}.json`;
    case 'vehicle-listing':
      return `vehicle-listings/${id}.json`;
    case 'driving':
      return `driving/${id}.json`;
    case 'material':
      return `materials/${id}.json`;
    case 'engine-sound':
      return `engine-sounds/${id}.json`;
    case 'surface-sound':
      return `surface-sounds/${id}.json`;
    case 'audio':
      return `audio/${id}.json`;
    case 'image':
      return `images/${sha256}.json`;
    case 'course':
      return `courses/${id}.course.json`;
    case 'envelope':
      return `envelopes/${id}.json`;
    case 'budget':
      return `budgets/${id}.json`;
  }
}

/** Sole output layout authority. Consumers resolve logical identities through the saved manifest. */
export function createContentWriter(root: URL) {
  const files: ContentEntry[] = [];
  return {
    /** Stage one file and return the SHA-256 of its delivered bytes. */
    async stage(kind: ContentKind, id: string, value: unknown, encoded?: Uint8Array<ArrayBuffer>): Promise<string> {
      const bytes = encoded ?? encodeContentJson(value);
      const sha256 = await contentDigest(bytes);
      const path = contentPath(kind, id, sha256);
      const entry = { kind, id, path, sha256 };
      const previous = files.find((file) => file.kind === kind && file.id === id);
      if (previous) {
        if (previous.sha256 !== sha256) throw new Error(`Conflicting content: ${kind} ${id}`);
        return sha256;
      }
      const target = new URL(path, root);
      await mkdir(new URL('./', target), { recursive: true });
      await writeFile(target, bytes);
      files.push(entry);
      return sha256;
    },
    async save() {
      const manifest = requireLoaded(
        readContentManifest({ format: 'superoutride.content-manifest', version: 1, files }),
      );
      await writeFile(new URL('manifest.json', root), JSON.stringify(manifest) + '\n');
    },
  };
}
