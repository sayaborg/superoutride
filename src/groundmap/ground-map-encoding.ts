import { rgbaToRgb555 } from '../graphics/rgb555.js';
import type { BakedGroundMapStorageFormat } from './baked-ground-map.js';
import type { GroundMapTexelLevel } from './ground-map-prefilter.js';

/** Select a level's storage once; chunk encoding never changes its palette or format. */
export function createGroundMapLevelEncoder(source: GroundMapTexelLevel, allowPalette: boolean) {
  const palette = allowPalette ? collectPalette(source) : null;
  const paletteRgba = palette ?? [];
  const format: BakedGroundMapStorageFormat = palette !== null ? 'palette8' : 'rgb555le';
  const paletteIndex = new Map(paletteRgba.map((color, index) => [color >>> 0, index]));
  return {
    format,
    paletteRgba,
    encodeRows: (rowStart: number, rowCount: number) => encodeRows(source, rowStart, rowCount, format, paletteIndex),
  };
}

function collectPalette(base: GroundMapTexelLevel): number[] | null {
  const colors = new Set<number>();
  for (const color of base.pixels) {
    colors.add(color >>> 0);
    if (colors.size > 256) return null;
  }
  return [...colors].sort((a, b) => a - b);
}

function encodeRows(
  source: GroundMapTexelLevel,
  rowStart: number,
  rowCount: number,
  format: BakedGroundMapStorageFormat,
  paletteIndex: ReadonlyMap<number, number>,
): Uint8Array {
  const texelCount = source.lateralTexels * rowCount;
  const bytes = new Uint8Array(texelCount * (format === 'palette8' ? 1 : 2));
  let out = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const sourceOffset = (rowStart + row) * source.lateralTexels;
    for (let column = 0; column < source.lateralTexels; column += 1) {
      const color = source.pixels[sourceOffset + column]! >>> 0;
      if (format === 'palette8') {
        const index = paletteIndex.get(color);
        if (index === undefined) throw new Error('level-0 GroundMap color missing from palette');
        bytes[out] = index;
        out += 1;
      } else {
        const packed = rgbaToRgb555(color);
        bytes[out] = packed & 0xff;
        bytes[out + 1] = (packed >>> 8) & 0x7f;
        out += 2;
      }
    }
  }
  return bytes;
}
