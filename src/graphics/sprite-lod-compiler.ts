import { createSpriteAreaFilter } from './sprite-area-filter.js';
import { readSpriteLodAsset, spriteLodLayout, type SpriteLodDocument } from './sprite.js';

/** An explicit authoring recipe, not a default production-art policy. */
export function compileSpriteLodWithAuthoredPalette(source: SpriteLodDocument, recipe: unknown): SpriteLodDocument {
  const master = readSpriteLodAsset(source);
  if (master.levels.length !== 1) throw new RangeError('sprite compiler requires exactly one normalized master');
  const original = source.levels[0]!;
  const paletteRgb555 = [...original.paletteRgb555];
  const filter = createSpriteAreaFilter(paletteRgb555, recipe);
  const levels = spriteLodLayout(master.width, master.height).map(({ width, height }, k) => {
    if (k === 0) return { paletteRgb555: [...paletteRgb555], indices: [...original.indices] };
    const step = 2 ** k,
      indices = Array<number>(width * height).fill(0);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const x0 = x * step,
          y0 = y * step;
        const x1 = Math.min(master.width, x0 + step),
          y1 = Math.min(master.height, y0 + step);
        // Direct master integration; storage padding lies outside this logical footprint.
        indices[y * width + x] = filter(master.levels[0]!.pixels, master.width, x0, y0, x1, y1, (x1 - x0) * (y1 - y0));
      }
    return { paletteRgb555: [...paletteRgb555], indices };
  });
  return { ...source, levels };
}
