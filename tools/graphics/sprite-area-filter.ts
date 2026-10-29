import { readIndexedPalette } from '../../src/image/indexed-image.js';
import { IMAGE_OPAQUE_COVERAGE, rgb555LinearChannel, type integrateImageBox } from '../../src/image/image-filter.js';

/**
 * Source normalization chooses each texel's closest authored slot from its area sample (transparent below opaque
 * coverage, ties to the lower RGB555 code); LOD instead retains palette mixtures.
 */
export function createSpriteSlotChooser(palette: readonly number[]) {
  const colors = readIndexedPalette(palette).map((color) => [
    rgb555LinearChannel(color >>> 10),
    rgb555LinearChannel((color >>> 5) & 31),
    rgb555LinearChannel(color & 31),
  ]);
  return (sample: ReturnType<typeof integrateImageBox>) => {
    if (sample.coverage < IMAGE_OPAQUE_COVERAGE) return 0;
    let best = 1,
      error = Infinity;
    for (let index = 1; index < 16; index++) {
      const color = colors[index]!;
      const distance = (color[0]! - sample.red) ** 2 + (color[1]! - sample.green) ** 2 + (color[2]! - sample.blue) ** 2;
      if (distance < error || (distance === error && palette[index]! < palette[best]!)) {
        best = index;
        error = distance;
      }
    }
    return best;
  };
}
