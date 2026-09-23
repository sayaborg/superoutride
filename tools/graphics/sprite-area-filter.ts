import { readIndexedPalette } from '../../src/image/indexed-image.js';
import { IMAGE_OPAQUE_COVERAGE, integrateImageBox, rgb555LinearChannel } from '../../src/image/image-filter.js';

/** Source normalization chooses the closest authored slot; LOD instead retains palette mixtures. */
export function createSpriteAreaFilter(palette: readonly number[]) {
  const colors = readIndexedPalette(palette).map((color) => [
    rgb555LinearChannel(color >>> 10),
    rgb555LinearChannel((color >>> 5) & 31),
    rgb555LinearChannel(color & 31),
  ]);
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
    const sample = integrateImageBox(pixels, width, x0, y0, x1, y1, area, unit);
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
