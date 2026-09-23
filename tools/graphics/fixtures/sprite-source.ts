import { rgba } from '../../../src/image/rgb555.js';

/** An image-processing study, not production art or a vehicle dimensional reference. */
export function createSpriteSourceFixture() {
  const width = 96,
    height = 64,
    pixels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x >= 46 && x <= 49 && y >= 52) pixels[y * width + x] = rgba(220, 225, 232);
      if (x < 8 || x >= 88 || y < 8 || y >= 52) continue;
      const edge = x === 8 || x === 87 || y === 8 || y === 51;
      pixels[y * width + x] = rgba(30 + x * 2, 55 + y * 3, 235 - x * 2, edge ? 128 : 255);
      if (y >= 28 && y < 32 && x >= 22 && x < 72) pixels[y * width + x] = rgba(255, 255, 255);
    }
  return { width, height, pixels };
}
