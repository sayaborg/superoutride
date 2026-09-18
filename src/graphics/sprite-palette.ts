import { rgbaToRgb555 } from './rgb555.js';
import { unpackRgba } from './software-surface.js';
import { SPRITE_SOURCE_PIXEL_LIMIT } from './sprite-source-compiler.js';

interface ColorBin {
  readonly code: number;
  readonly channels: readonly number[];
  readonly weight: number;
}

/** Deterministic authoring candidate: alpha-weighted median cut on the RGB555 lattice. */
export function generateSpritePalette(
  image: { readonly width: number; readonly height: number; readonly pixels: Uint32Array },
  crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  maxColors: number,
): number[] {
  if (
    ![image.width, image.height].every((v) => Number.isSafeInteger(v) && v > 0) ||
    image.width * image.height > SPRITE_SOURCE_PIXEL_LIMIT ||
    !(image.pixels instanceof Uint32Array) ||
    image.pixels.length !== image.width * image.height
  )
    throw new RangeError('palette source requires positive dimensions and matching RGBA pixels');
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > image.width ||
    crop.y + crop.height > image.height
  )
    throw new RangeError('palette crop must be an integer rectangle inside the source');
  if (!Number.isSafeInteger(maxColors) || maxColors < 1 || maxColors > 15)
    throw new RangeError('palette size must be 1 to 15');
  const histogram = new Map<number, number>();
  for (let y = crop.y; y < crop.y + crop.height; y++)
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const pixel = image.pixels[y * image.width + x]!,
        alpha = unpackRgba(pixel).a;
      if (!alpha) continue;
      const code = rgbaToRgb555(pixel);
      histogram.set(code, (histogram.get(code) ?? 0) + alpha);
    }
  const bins = [...histogram]
    .sort(([a], [b]) => a - b)
    .map(([code, weight]) => ({
      code,
      weight,
      channels: [(code >>> 10) & 31, (code >>> 5) & 31, code & 31],
    }));
  if (bins.length <= maxColors) return bins.map((bin) => bin.code);
  const boxes = [box(bins)];
  while (boxes.length < maxColors) {
    // Priority: greatest channel range, total alpha, then lowest contained RGB555 code.
    boxes.sort((a, b) => b.range - a.range || b.weight - a.weight || a.minimum - b.minimum);
    const selected = boxes.shift()!;
    if (!selected.range) {
      boxes.unshift(selected);
      break;
    }
    const sorted = [...selected.bins].sort(
      (a, b) => a.channels[selected.axis]! - b.channels[selected.axis]! || a.code - b.code,
    );
    let split = 0,
      weight = 0;
    do {
      weight += sorted[split++]!.weight;
    } while (split < sorted.length - 1 && weight < selected.weight / 2);
    boxes.push(box(sorted.slice(0, split)), box(sorted.slice(split)));
  }
  return [
    ...new Set(
      boxes.map(({ bins, weight }) => {
        const mean = [0, 1, 2].map((axis) =>
          Math.round(bins.reduce((sum, bin) => sum + bin.weight * bin.channels[axis]!, 0) / weight),
        );
        return (mean[0]! << 10) | (mean[1]! << 5) | mean[2]!;
      }),
    ),
  ].sort((a, b) => a - b);
}

function box(bins: readonly ColorBin[]) {
  const low = [31, 31, 31],
    high = [0, 0, 0];
  let weight = 0,
    minimum = 32767;
  for (const bin of bins) {
    weight += bin.weight;
    minimum = Math.min(minimum, bin.code);
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis]!, bin.channels[axis]!);
      high[axis] = Math.max(high[axis]!, bin.channels[axis]!);
    }
  }
  const ranges = high.map((value, axis) => value - low[axis]!);
  const range = Math.max(...ranges),
    axis = ranges.indexOf(range); // R, then G, then B on ties.
  return { bins, weight, minimum, range, axis };
}
