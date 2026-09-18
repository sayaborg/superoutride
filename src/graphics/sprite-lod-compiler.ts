import { rgb555ToRgba } from './rgb555.js';
import { unpackRgba } from './software-surface.js';
import { readSpriteLodAsset, spriteLodLayout, type SpriteLodDocument } from './sprite.js';

/** An explicit authoring recipe, not a default production-art policy. */
export function compileSpriteLodWithAuthoredPalette(source: SpriteLodDocument, recipe: unknown): SpriteLodDocument {
  const master = readSpriteLodAsset(source);
  if (master.levels.length !== 1) throw new RangeError('sprite compiler requires exactly one normalized master');
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe))
    throw new RangeError('explicit sprite recipe is required');
  const settings = recipe as Record<string, unknown>;
  const { colorSpace, coverageThreshold } = settings;
  if (
    !Object.hasOwn(settings, 'colorSpace') ||
    !Object.hasOwn(settings, 'coverageThreshold') ||
    Object.keys(settings).some((key) => key !== 'colorSpace' && key !== 'coverageThreshold') ||
    (colorSpace !== 'encoded-srgb' && colorSpace !== 'linear-srgb') ||
    typeof coverageThreshold !== 'number' ||
    !Number.isFinite(coverageThreshold) ||
    coverageThreshold <= 0 ||
    coverageThreshold > 1
  ) {
    throw new RangeError('recipe requires encoded-srgb/linear-srgb and a coverageThreshold in (0,1]');
  }
  const original = source.levels[0]!;
  const paletteRgb555 = [...original.paletteRgb555];
  const colors = paletteRgb555.map((color) => {
    const { r, g, b } = unpackRgba(rgb555ToRgba(color));
    return [r, g, b].map((channel) => {
      const encoded = channel / 255;
      // W3C CSS Color 4, sRGB transfer function; inputs here are always in gamut.
      return colorSpace === 'encoded-srgb'
        ? encoded
        : encoded <= 0.04045
          ? encoded / 12.92
          : ((encoded + 0.055) / 1.055) ** 2.4;
    });
  });
  const layout = spriteLodLayout(master.width, master.height);
  const levels = layout.map(({ width, height }, k) => {
    if (k === 0) return { paletteRgb555: [...paletteRgb555], indices: [...original.indices] };
    const step = 2 ** k,
      indices = Array<number>(width * height).fill(0);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const x0 = x * step,
          y0 = y * step;
        const x1 = Math.min(master.width, x0 + step),
          y1 = Math.min(master.height, y0 + step);
        let count = 0,
          red = 0,
          green = 0,
          blue = 0;
        // Every level integrates the master directly. Quantized LODs are never filter inputs.
        for (let sy = y0; sy < y1; sy++)
          for (let sx = x0; sx < x1; sx++) {
            const index = original.indices[sy * master.width + sx]!;
            if (index === 0) continue;
            const color = colors[index - 1]!;
            count++;
            red += color[0]!;
            green += color[1]!;
            blue += color[2]!;
          }
        // Only the logical part of a partial edge cell contributes area; storage padding has no color.
        if (count === 0 || count / ((x1 - x0) * (y1 - y0)) < coverageThreshold) continue;
        red /= count;
        green /= count;
        blue /= count;
        let best = -1,
          error = Infinity;
        for (let i = 0; i < colors.length; i++) {
          const color = colors[i]!;
          const distance = (color[0]! - red) ** 2 + (color[1]! - green) ** 2 + (color[2]! - blue) ** 2;
          if (distance < error || (distance === error && paletteRgb555[i]! < paletteRgb555[best]!)) {
            best = i;
            error = distance;
          }
        }
        indices[y * width + x] = best + 1;
      }
    return { paletteRgb555: [...paletteRgb555], indices };
  });
  return { ...source, levels };
}
