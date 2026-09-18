import { rgb555ToRgba } from './rgb555.js';
import { unpackRgba } from './software-surface.js';
import { readSpritePaletteRgb555 } from './sprite.js';

/** Shared offline area/coverage/palette rule. Callers supply validated image bounds. */
export function createSpriteAreaFilter(palette: readonly number[], recipe: unknown) {
  const paletteRgb555 = readSpritePaletteRgb555(palette);
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
  )
    throw new RangeError('recipe requires encoded-srgb/linear-srgb and a coverageThreshold in (0,1]');
  const channels = Array.from({ length: 256 }, (_, byte) => {
    const encoded = byte / 255;
    // W3C CSS Color 4. Source samples are explicitly interpreted as encoded sRGB.
    return colorSpace === 'encoded-srgb'
      ? encoded
      : encoded <= 0.04045
        ? encoded / 12.92
        : ((encoded + 0.055) / 1.055) ** 2.4;
  });
  const colors = paletteRgb555.map((color) => {
    const { r, g, b } = unpackRgba(rgb555ToRgba(color));
    return [channels[r]!, channels[g]!, channels[b]!];
  });
  return (
    pixels: Uint32Array,
    width: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    area: number,
    unit = 1,
  ) => {
    let coverage = 0,
      red = 0,
      green = 0,
      blue = 0;
    for (let y = Math.floor(y0 / unit); y < Math.ceil(y1 / unit); y++)
      for (let x = Math.floor(x0 / unit); x < Math.ceil(x1 / unit); x++) {
        const { r, g, b, a } = unpackRgba(pixels[y * width + x]!);
        const weight =
          (Math.min((x + 1) * unit, x1) - Math.max(x * unit, x0)) *
          (Math.min((y + 1) * unit, y1) - Math.max(y * unit, y0)) *
          (a / 255);
        coverage += weight;
        red += weight * channels[r]!;
        green += weight * channels[g]!;
        blue += weight * channels[b]!;
      }
    if (coverage === 0 || coverage / area < coverageThreshold) return 0;
    if (colors.length === 0) throw new RangeError('opaque source coverage requires an authored palette');
    red /= coverage;
    green /= coverage;
    blue /= coverage;
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
    return best + 1;
  };
}
