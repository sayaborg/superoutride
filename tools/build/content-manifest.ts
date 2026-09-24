import { mkdir, writeFile } from 'node:fs/promises';
import { contentDigest } from '../../src/core/content-digest.js';
import { readContentManifest, type ContentEntry, type ContentKind } from '../../src/core/content-manifest.js';

/** Sole output layout authority. Consumers resolve logical identities through the saved manifest. */
export function createContentWriter(root: URL, initial: readonly ContentEntry[] = []) {
  const files = [...initial];
  return {
    async stage(kind: ContentKind, id: string, value: unknown, encoded?: Uint8Array<ArrayBuffer>) {
      const bytes = encoded ?? new TextEncoder().encode(JSON.stringify(value) + '\n');
      const sha256 = await contentDigest(bytes);
      const path =
        kind === 'image'
          ? `images/${sha256}.json`
          : kind === 'course'
            ? `courses/${id}.course.json`
            : kind === 'envelope'
              ? `envelopes/${id}.json`
              : `budgets/${id}.json`;
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
