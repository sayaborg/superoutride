/**
 * RGB555 colors in the Oklab color space, for palette adjustment. A channel's 5-bit code `c` is the sRGB-encoded value
 * `c / 31`, decoded with the sRGB transfer function to linear light; linear sRGB maps to Oklab by Björn Ottosson's
 * matrices. The way back encodes with the sRGB transfer function and rounds `31 * value` to the nearest code, so an
 * unadjusted color returns to its own code. A color outside the sRGB gamut keeps its lightness and hue and loses
 * chroma, by bisection, until it is inside; lightness is first limited to [0, 1].
 */

export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** A palette adjustment: zero in every field changes nothing. */
export interface PaletteAdjustment {
  /** Degrees added to the Oklab hue. */
  readonly hue: number;
  /** Relative chroma change: −1 removes all color, 0 keeps it, 1 doubles it. */
  readonly saturation: number;
  /** Added to Oklab lightness (0 to 1). */
  readonly lightness: number;
  /** A tint: `amount` of Oklab chroma added toward `hue` degrees. */
  readonly tint: { readonly hue: number; readonly amount: number };
}

export const NO_ADJUSTMENT: PaletteAdjustment = Object.freeze({
  hue: 0,
  saturation: 0,
  lightness: 0,
  tint: Object.freeze({ hue: 0, amount: 0 }),
});

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgb555ToOklab(color: number): Oklab {
  const r = decode(((color >>> 10) & 31) / 31),
    g = decode(((color >>> 5) & 31) / 31),
    b = decode((color & 31) / 31);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function linearRgb({ l: lightness, a, b }: Oklab): readonly [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPSILON = 1e-9;
const inGamut = (color: Oklab) => linearRgb(color).every((v) => v >= -EPSILON && v <= 1 + EPSILON);

export function oklabToRgb555(color: Oklab): number {
  let mapped = { ...color, l: Math.min(1, Math.max(0, color.l)) };
  if (!inGamut(mapped)) {
    // Keep lightness and hue; find the largest in-gamut fraction of the chroma.
    let low = 0,
      high = 1;
    for (let i = 0; i < 32; i++) {
      const middle = (low + high) / 2;
      if (inGamut({ l: mapped.l, a: color.a * middle, b: color.b * middle })) low = middle;
      else high = middle;
    }
    mapped = { l: mapped.l, a: color.a * low, b: color.b * low };
  }
  const [r, g, b] = linearRgb(mapped).map((v) => Math.round(31 * encode(Math.min(1, Math.max(0, v))))) as [
    number,
    number,
    number,
  ];
  return (r << 10) | (g << 5) | b;
}

/** One color adjusted: hue rotation and chroma scale in Oklab's polar form, lightness, then the tint. */
export function adjustRgb555(color: number, adjustment: PaletteAdjustment): number {
  const { l, a, b } = rgb555ToOklab(color);
  const chroma = Math.hypot(a, b) * Math.max(0, 1 + adjustment.saturation);
  const hue = Math.atan2(b, a) + (adjustment.hue * Math.PI) / 180;
  const tint = (adjustment.tint.hue * Math.PI) / 180;
  return oklabToRgb555({
    l: l + adjustment.lightness,
    a: chroma * Math.cos(hue) + adjustment.tint.amount * Math.cos(tint),
    b: chroma * Math.sin(hue) + adjustment.tint.amount * Math.sin(tint),
  });
}
