import { createHash } from 'node:crypto';

export function imageInput(id = 'image', palette = [0, 0x7c00, 0x3e0]) {
  const source = {
    format: 'superoutride.sprite-lod',
    version: 1,
    name: id,
    width: 4,
    height: 2,
    anchorX: 1.5,
    anchorY: 1,
    levels: [{ paletteRgb555: palette, indices: [0, 1, 2, 3, 3, 2, 1, 0] }],
  };
  return savedImageInput(id, source);
}

export function savedImageInput(id, source) {
  const bytes = source instanceof Uint8Array ? source : new TextEncoder().encode(JSON.stringify(source));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    reference: { id, format: 'superoutride.sprite-lod', version: 1, sha256 },
    input: { sha256, bytes },
    source,
  };
}
