import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded, type ContentKind } from '../../src/content/content-load-error.js';
import { readContentManifest, type ContentEntry } from '../../src/content/content-manifest.js';
import type { DeliveredFile } from './compile-content.js';

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
    case 'free-play':
      return `free-play/${id}.json`;
    case 'recording':
      return `recordings/${id}.m4a`;
    case 'music':
      return `music/${id}.json`;
    case 'wall-sound':
      return `wall-sounds/${id}.json`;
    case 'image':
      return `images/${sha256}.json`;
    case 'course':
      return `courses/${id}.course.json`;
    case 'course-index':
      return 'course-index.json';
    case 'series':
      return `series/${id}.series.json`;
    case 'envelope':
      return `envelopes/${id}.json`;
    case 'reference-times':
      return `reference-times/${id}.json`;
    case 'schedule':
      return `schedules/${id}.json`;
  }
}

/**
 * The delivery layout, its sole authority: each delivered file's bytes at its path, and `manifest.json` indexing them.
 * The manifest comes last. Consumers resolve logical identities through it. A kind and ID delivered twice must have the same bytes.
 */
export async function layoutDelivery(
  files: readonly DeliveredFile[],
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> {
  const entries: ContentEntry[] = [];
  const layout = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const { kind, id, bytes } of files) {
    const sha256 = await contentDigest(bytes);
    const previous = entries.find((entry) => entry.kind === kind && entry.id === id);
    if (previous) {
      if (previous.sha256 !== sha256) throw new Error(`Conflicting content: ${kind} ${id}`);
      continue;
    }
    const path = contentPath(kind, id, sha256);
    entries.push({ kind, id, path, sha256 });
    layout.set(path, bytes);
  }
  const manifest = requireLoaded(
    readContentManifest({ format: 'superoutride.content-manifest', version: 1, files: entries }),
  );
  layout.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest) + '\n'));
  return layout;
}
