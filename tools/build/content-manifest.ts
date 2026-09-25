import { mkdir, writeFile } from 'node:fs/promises';
import { contentDigest } from '../../src/core/content-digest.js';
import { readContentManifest, type ContentEntry, type ContentKind } from '../../src/core/content-manifest.js';

function contentPath(kind: ContentKind, id: string, sha256: string): string {
  switch (kind) {
    case 'vehicle':
      return `vehicles/${id}.json`;
    case 'driving':
      return `driving/${id}.json`;
    case 'material':
      return `materials/${id}.json`;
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
export function createContentWriter(root: URL, initial: readonly ContentEntry[] = []) {
  const files = [...initial];
  return {
    async stage(kind: ContentKind, id: string, value: unknown, encoded?: Uint8Array<ArrayBuffer>) {
      const bytes = encoded ?? new TextEncoder().encode(JSON.stringify(value) + '\n');
      const sha256 = await contentDigest(bytes);
      const path = contentPath(kind, id, sha256);
      const entry = { kind, id, path, sha256 };
      const previous = files.find((file) => file.kind === kind && file.id === id);
      if (previous) {
        if (previous.sha256 !== sha256) throw new Error(`Conflicting content: ${kind} ${id}`);
        return;
      }
      const target = new URL(path, root);
      await mkdir(new URL('./', target), { recursive: true });
      await writeFile(target, bytes);
      files.push(entry);
    },
    async save() {
      const manifest = readContentManifest({ format: 'superoutride.content-manifest', version: 1, files });
      await writeFile(new URL('manifest.json', root), JSON.stringify(manifest) + '\n');
    },
  };
}
