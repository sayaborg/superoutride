import { spriteIdentityMixtures } from '../../dist/graphics/sprite.js';

export const palette16 = (colors) => [0, ...colors, ...Array(15 - colors.length).fill(colors[0] ?? 0)];
export function masterDocument(width, height, colors, indices, name = 'IMAGE_PROBE', variants = []) {
  return {
    format: 'superoutride.sprite-lod',
    version: 2,
    name,
    width,
    height,
    anchorX: (width - 1) / 2,
    anchorY: height - 1,
    variants,
    levels: [{ paletteRgb555: palette16(colors), indices, mixtures: spriteIdentityMixtures() }],
  };
}
export function levelPixels(level) {
  return Uint32Array.from(
    { length: level.width * level.height },
    (_, i) => level.paletteRgba[level.pattern.indexAt(i)],
  );
}
export function backgroundDocument(color = 0x001f) {
  return {
    format: 'superoutride.tile-background',
    version: 1,
    name: 'BACKGROUND_PROBE',
    patterns: [{ indices: Array(256).fill(1) }],
    palettes: [palette16([color])],
    tiles: Array.from({ length: 80 * 40 }, () => [0, 0]),
  };
}
