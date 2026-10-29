import { unpackRgba } from '../../src/image/rgb555.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteRaster } from '../graphics/sprite-layers.js';
import { sampleSpriteSource, type ImageTransform, type LinearSample } from '../graphics/sprite-colors.js';

function bounds(width: number, height: number, opaque: (x: number, y: number) => boolean) {
  let left = width,
    right = 0,
    top = height,
    bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (opaque(x, y)) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
  if (right <= left || bottom <= top) throw new RangeError('Silhouette must contain opaque pixels');
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** Uniform scale and translation only. Diagnostics are measured before the two-texel silhouette clip. */
export function registerPublicSource(image: SourceImage, reference: SpriteRaster) {
  const sourceMask = Uint8Array.from(image.pixels, (p) => (unpackRgba(p).a >= 128 ? 1 : 0));
  const source = bounds(image.width, image.height, (x, y) => sourceMask[y * image.width + x] === 1);
  const target = bounds(reference.width, reference.height, (x, y) => reference.indices[y * reference.width + x]! > 0);
  const initialScale =
    (target.width * source.width + target.height * source.height) / (source.width ** 2 + source.height ** 2);
  let transform: ImageTransform = {
    scale: initialScale,
    x: (target.left + target.right - initialScale * (source.left + source.right)) / 2,
    y: (target.top + target.bottom - initialScale * (source.top + source.bottom)) / 2,
  };
  const referenceAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < reference.width && y < reference.height && reference.indices[y * reference.width + x]! > 0;
  const score = (t: ImageTransform) => {
    let intersection = 0,
      union = 0;
    const left = Math.min(0, Math.floor(source.left * t.scale + t.x)),
      top = Math.min(0, Math.floor(source.top * t.scale + t.y));
    const right = Math.max(reference.width, Math.ceil(source.right * t.scale + t.x)),
      bottom = Math.max(reference.height, Math.ceil(source.bottom * t.scale + t.y));
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const sx = Math.floor((x + 0.5 - t.x) / t.scale),
          sy = Math.floor((y + 0.5 - t.y) / t.scale);
        const a = referenceAt(x, y),
          b = sx >= 0 && sy >= 0 && sx < image.width && sy < image.height && sourceMask[sy * image.width + sx] === 1;
        if (a || b) union++;
        if (a && b) intersection++;
      }
    return intersection / union;
  };
  let best = score(transform);
  for (const step of [8, 4, 2, 1, 0.5, 0.25])
    for (let sweep = 0; sweep < 8; sweep++) {
      let improved = false;
      for (const axis of ['x', 'y', 'scale'] as const)
        for (const direction of [-1, 1]) {
          const delta = (step * direction) / (axis === 'scale' ? Math.max(source.width, source.height) : 1);
          const next = { ...transform, [axis]: transform[axis] + delta };
          if (next.scale < initialScale * 0.6 || next.scale > initialScale * 1.4) continue;
          const value = score(next);
          if (value > best) {
            best = value;
            transform = next;
            improved = true;
          }
        }
      if (!improved) break;
    }
  // Include transformed pixels outside the reference frame in the final union and edge displacement.
  const left = Math.min(0, Math.floor(source.left * transform.scale + transform.x) - 1),
    top = Math.min(0, Math.floor(source.top * transform.scale + transform.y) - 1);
  const right = Math.max(reference.width, Math.ceil(source.right * transform.scale + transform.x) + 1),
    bottom = Math.max(reference.height, Math.ceil(source.bottom * transform.scale + transform.y) + 1);
  const width = right - left,
    height = bottom - top;
  const measured = sampleSpriteSource(image, width, height, {
    ...transform,
    x: transform.x - left,
    y: transform.y - top,
  });
  let intersection = 0,
    union = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = referenceAt(x + left, y + top),
        b = measured[y * width + x]!.coverage >= 0.5;
      if (a || b) union++;
      if (a && b) intersection++;
    }
  const actual = bounds(width, height, (x, y) => measured[y * width + x]!.coverage >= 0.5);
  const edges = {
    left: actual.left + left - target.left,
    right: actual.right + left - target.right,
    bottom: actual.bottom + top - target.bottom,
  };
  const iou = intersection / union,
    passed = iou >= 0.9 && Object.values(edges).every((v) => Math.abs(v) <= 2);
  const samples: LinearSample[] = [];
  for (let y = 0; y < reference.height; y++)
    for (let x = 0; x < reference.width; x++) {
      let keep = false;
      for (let dy = -2; dy <= 2 && !keep; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (dx * dx + dy * dy <= 4 && referenceAt(x + dx, y + dy)) {
            keep = true;
            break;
          }
      const sample = measured[(y - top) * width + x - left]!;
      samples.push(keep ? sample : { coverage: 0, red: 0, green: 0, blue: 0 });
    }
  return {
    transform,
    diagnostics: { iou, edges, passed, thresholds: { iou: 0.9, edgeTexels: 2 }, clipTexels: 2 },
    samples,
  };
}
