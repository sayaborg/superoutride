import { unpackRgba } from './software-surface.js';

/** One coverage rule for direct-master box filters; exact equality is opaque. */
export const IMAGE_OPAQUE_COVERAGE = 0.5;
const linearBytes = Object.freeze(
  Array.from({ length: 256 }, (_, byte) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }),
);
const linear555 = Object.freeze(Array.from({ length: 32 }, (_, code) => linearBytes[Math.round((code * 255) / 31)]!));

/** RGB555 channel decoding is a 32-entry lookup, including at runtime ground interpolation. */
export function rgb555LinearChannel(code: number): number {
  return linear555[code]!;
}

function encodedByte(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}

function linearToChannel5(value: number): number {
  return Math.round((encodedByte(value) * 31) / 255);
}

export function linearToRgb555(red: number, green: number, blue: number): number {
  return (linearToChannel5(red) << 10) | (linearToChannel5(green) << 5) | linearToChannel5(blue);
}

/** rho counts source units covered by a destination pixel; representation chooses rounding/interpolation. */
function imageLodExponent(rho: number): number {
  if (!(rho > 0) || !Number.isFinite(rho)) throw new RangeError('image footprint must be positive and finite');
  return Math.max(0, Math.log2(rho));
}

/** One level per octave. scale = 1/rho; geometric-mean equality selects the coarser level. */
export function selectImageLodLevel(scale: number, maxLevel: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError('image scale must be finite and positive');
  let level = Math.min(maxLevel, Math.floor(imageLodExponent(1 / scale)));
  let boundary = Math.SQRT1_2 * 2 ** -level;
  while (level < maxLevel && scale <= boundary) {
    level += 1;
    boundary *= 0.5;
  }
  return level;
}

/** Offline straight-alpha source integral. Coordinates may use integer rational-overlap units. */
export function integrateImageBox(
  pixels: Uint32Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  area: number,
  unit: number,
) {
  let coverage = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let y = Math.floor(y0 / unit); y < Math.ceil(y1 / unit); y++)
    for (let x = Math.floor(x0 / unit); x < Math.ceil(x1 / unit); x++) {
      const { r, g, b, a } = unpackRgba(pixels[y * width + x]!);
      const weight =
        ((Math.min((x + 1) * unit, x1) - Math.max(x * unit, x0)) *
          (Math.min((y + 1) * unit, y1) - Math.max(y * unit, y0)) *
          a) /
        255;
      coverage += weight;
      red += weight * linearBytes[r]!;
      green += weight * linearBytes[g]!;
      blue += weight * linearBytes[b]!;
    }
  return {
    coverage: coverage / area,
    red: coverage ? red / coverage : 0,
    green: coverage ? green / coverage : 0,
    blue: coverage ? blue / coverage : 0,
  };
}

export type PaletteMixture = readonly (readonly [index: number, weight: number])[];

/** The same linear operation builds normal and replacement level palettes. */
export function evaluatePaletteMixture(
  mixture: PaletteMixture,
  palette: readonly number[],
): readonly [number, number, number] {
  let r = 0,
    g = 0,
    b = 0;
  for (const [index, weight] of mixture) {
    const color = palette[index]!;
    r += weight * rgb555LinearChannel(color >>> 10);
    g += weight * rgb555LinearChannel((color >>> 5) & 31);
    b += weight * rgb555LinearChannel(color & 31);
  }
  return [r, g, b];
}
