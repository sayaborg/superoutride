import { unpackRgba } from '../../src/image/rgb555.js';
import { IMAGE_OPAQUE_COVERAGE } from '../../src/image/image-filter.js';
import { sampleSpriteSource, type ImageTransform, type LinearSample } from './sprite-colors.js';
import type { SourceImage } from './sprite-source-compiler.js';

/** A reference outline: a frame's texels, opaque where nonzero. */
export interface RegistrationReference {
  readonly width: number;
  readonly height: number;
  readonly indices: readonly number[];
}

/** The outline IoU below which a registered picture is marked for review. */
export const REGISTRATION_IOU_LIMIT = 0.9;

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

/**
 * Fit a source image's outline (alpha 128 or more) to a reference frame's by translation and uniform scale alone: from
 * the opaque bounds, a deterministic search with decreasing steps for the greatest overlap; it does not warp the shape
 * and is a heuristic, not a proof of a global optimum. `transform` maps a source pixel p to the reference's
 * `scale·p + (x, y)`. The result is measured by the area-filtered coverage of the whole transformed source, pixels
 * outside the reference frame included (`measured`, a window from `left`, `top`): its outline IoU against the
 * reference and the displacement in texels of its left, right and bottom edges. Nothing is clipped.
 */
export function registerSpriteSource(image: SourceImage, reference: RegistrationReference) {
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
  const left = Math.min(0, Math.floor(source.left * transform.scale + transform.x) - 1),
    top = Math.min(0, Math.floor(source.top * transform.scale + transform.y) - 1);
  const right = Math.max(reference.width, Math.ceil(source.right * transform.scale + transform.x) + 1),
    bottom = Math.max(reference.height, Math.ceil(source.bottom * transform.scale + transform.y) + 1);
  const width = right - left,
    height = bottom - top;
  const samples: readonly LinearSample[] = sampleSpriteSource(image, width, height, {
    ...transform,
    x: transform.x - left,
    y: transform.y - top,
  });
  let intersection = 0,
    union = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = referenceAt(x + left, y + top),
        b = samples[y * width + x]!.coverage >= IMAGE_OPAQUE_COVERAGE;
      if (a || b) union++;
      if (a && b) intersection++;
    }
  const actual = bounds(width, height, (x, y) => samples[y * width + x]!.coverage >= IMAGE_OPAQUE_COVERAGE);
  const edges = {
    left: actual.left + left - target.left,
    right: actual.right + left - target.right,
    bottom: actual.bottom + top - target.bottom,
  };
  return { transform, iou: intersection / union, edges, measured: { left, top, width, height, samples } };
}
