import { masterDocument } from './indexed-images.mjs';
import { createHash } from 'node:crypto';

export function imageInput(id = 'image', palette = [0, 0x7c00, 0x3e0]) {
  const source = masterDocument(4, 2, palette, [0, 1, 2, 3, 3, 2, 1, 0], id);
  return savedImageInput(id, source);
}

export function savedImageInput(id, source) {
  const bytes = source instanceof Uint8Array ? source : new TextEncoder().encode(JSON.stringify(source));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    reference: { id, format: source.format ?? 'superoutride.sprite-lod', version: source.version ?? 2, sha256 },
    input: { sha256, bytes },
    source,
  };
}
