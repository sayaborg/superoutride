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
    levels: Array.from({ length: Math.ceil(Math.log2(Math.max(width, height))) + 1 }, (_, k) => ({
      paletteRgb555: [colors[k % colors.length]!],
      indices: Array<number>(Math.ceil(width / 2 ** k) * Math.ceil(height / 2 ** k)).fill(1),
    })),
  };
}
