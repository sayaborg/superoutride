import { spriteLodLayout, type SpriteLodDocument } from '../../graphics/sprite.js';

/** Deliberately distinct solid colors identify levels; these are not image-filter quality samples. */
export function createSpriteLodFixture(width = 80, height = 56) {
  const colors = [0x03e0, 0x001f, 0x7c00, 0x7fe0, 0x7c1f, 0x03ff, 0x4210, 0x7fff];
  return {
    format: 'superoutride.sprite-lod',
    version: 1,
    name: `METRIC_${width}_${height}`,
    width,
    height,
    anchorX: (width - 1) / 2,
    anchorY: height - 1,
    levels: spriteLodLayout(width, height).map((level, k) => ({
      paletteRgb555: [colors[k % colors.length]!],
      indices: Array<number>(level.width * level.height).fill(1),
    })),
  };
}

/** High-frequency paint and thin binary coverage for explicit offline recipe comparisons. */
export function createSpriteLodFilterFixture(): SpriteLodDocument {
  const width = 80,
    height = 56,
    indices = Array<number>(width * height).fill(0);
  for (let y = 12; y < 44; y++) for (let x = 8; x < 72; x++) indices[y * width + x] = ((x + y) % 2) + 1;
  for (let y = 44; y < 50; y++) for (let x = 8; x < 72; x++) indices[y * width + x] = 5;
  for (let y = 2; y < 12; y++) indices[y * width + 40] = 5;
  return {
    format: 'superoutride.sprite-lod',
    version: 1,
    name: 'FILTER_CHECKER',
    width,
    height,
    anchorX: 39.5,
    anchorY: 55,
    levels: [{ paletteRgb555: [0, 0x7fff, 0x4210, 0x5ef7, 0x7c00, 0x4000], indices }],
  };
}
