import { PNG } from 'pngjs';

/**
 * A small deterministic raster for the drawn pictures: straight RGBA, one 32-bit word a pixel (0 transparent), with
 * filled shapes, bands, outlines and a block font. Every operation writes whole pixels of one color; nothing blends,
 * so a picture holds exactly the colors it is drawn with.
 */
export interface Raster {
  readonly width: number;
  readonly height: number;
  /** Row-major pixels: 0 transparent, else `0x1RRGGBB`, the drawn color with bit 24 marking it opaque. */
  readonly pixels: Uint32Array;
}

/** A color as `0xRRGGBB`; drawn opaque. */
export type Color = number;
export type Point = readonly [x: number, y: number];

const OPAQUE = 0x1000000;

export function createRaster(width: number, height: number): Raster {
  return { width, height, pixels: new Uint32Array(width * height) };
}

/** Set one pixel, inside the raster only. */
export function plot(raster: Raster, x: number, y: number, color: Color) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
  raster.pixels[y * raster.width + x] = color | OPAQUE;
}

/** Whether a pixel is drawn. */
export const drawn = (raster: Raster, x: number, y: number) =>
  x >= 0 && y >= 0 && x < raster.width && y < raster.height && raster.pixels[y * raster.width + x] !== 0;

export function fillRect(raster: Raster, x: number, y: number, width: number, height: number, color: Color) {
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(raster.height, Math.floor(y + height)); j++)
    for (let i = Math.max(0, Math.floor(x)); i < Math.min(raster.width, Math.floor(x + width)); i++)
      raster.pixels[j * raster.width + i] = color | OPAQUE;
}

/** Fill a polygon by pixel centres (even-odd). */
export function fillPolygon(raster: Raster, points: readonly Point[], color: Color) {
  const ys = points.map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys))),
    bottom = Math.min(raster.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = top; y <= bottom; y++) {
    const cy = y + 0.5,
      xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i]!,
        [x1, y1] = points[(i + 1) % points.length]!;
      if (y0 <= cy !== y1 <= cy) xs.push(x0 + ((cy - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (
        let x = Math.max(0, Math.ceil(xs[k]! - 0.5));
        x <= Math.min(raster.width - 1, Math.floor(xs[k + 1]! - 0.5));
        x++
      )
        raster.pixels[y * raster.width + x] = color | OPAQUE;
  }
}

/** Fill an ellipse by pixel centres. */
export function fillEllipse(raster: Raster, cx: number, cy: number, rx: number, ry: number, color: Color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx,
        dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) plot(raster, x, y, color);
    }
}

/** A line `width` pixels thick, as a polygon. */
export function line(raster: Raster, a: Point, b: Point, width: number, color: Color) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (width / 2),
    ny = (dx / length) * (width / 2);
  fillPolygon(
    raster,
    [
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ],
    color,
  );
}

/**
 * Horizontal bands from `top` to `bottom`: the colors in order, each an equal share, the period's stepped gradient.
 */
export function bands(
  raster: Raster,
  top: number,
  bottom: number,
  colors: readonly Color[],
  left = 0,
  right = raster.width,
) {
  const step = (bottom - top) / colors.length;
  colors.forEach((color, i) =>
    fillRect(
      raster,
      left,
      Math.round(top + i * step),
      right - left,
      Math.round(top + (i + 1) * step) - Math.round(top + i * step),
      color,
    ),
  );
}

/**
 * Draw `draw`'s shapes with an outline `thickness` pixels wide: every undrawn pixel within that many 4-adjacent steps of
 * a drawn one takes `outline`, then the shapes are copied over.
 */
export function outlined(raster: Raster, outline: Color, draw: (layer: Raster) => void, thickness = 1) {
  const layer = createRaster(raster.width, raster.height);
  draw(layer);
  let edge = layer.pixels.map((value) => (value ? 1 : 0));
  for (let pass = 0; pass < thickness; pass++) {
    const grown = edge.slice();
    for (let y = 0; y < raster.height; y++)
      for (let x = 0; x < raster.width; x++) {
        const i = y * raster.width + x;
        if (edge[i]) continue;
        if (
          (x > 0 && edge[i - 1]) ||
          (x + 1 < raster.width && edge[i + 1]) ||
          (y > 0 && edge[i - raster.width]) ||
          (y + 1 < raster.height && edge[i + raster.width])
        ) {
          grown[i] = 1;
          raster.pixels[i] = outline | OPAQUE;
        }
      }
    edge = grown;
  }
  layer.pixels.forEach((value, i) => {
    if (value) raster.pixels[i] = value;
  });
}

/** Copy every drawn pixel of `source` onto `target` at (x, y). */
export function blit(target: Raster, source: Raster, x: number, y: number) {
  for (let j = 0; j < source.height; j++)
    for (let i = 0; i < source.width; i++) {
      const value = source.pixels[j * source.width + i]!;
      if (value) plot(target, x + i, y + j, value & 0xffffff);
    }
}

/** Mirror a raster left to right. */
export function mirrored(source: Raster): Raster {
  const result = createRaster(source.width, source.height);
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++)
      result.pixels[y * source.width + x] = source.pixels[y * source.width + source.width - 1 - x]!;
  return result;
}

// A 5×7 block font: A–Z, 0–9, space, '-' and '.'.
const FONT: Readonly<Record<string, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '10101', '11001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
};

/** The width of `text` in the block font at `scale`, one blank column between glyphs. */
export const textWidth = (text: string, scale: number) => (text.length * 6 - 1) * scale;

/**
 * Write `text` in the block font with its top-left at (x, y), each font pixel `scale` square and slanted right by
 * `slant` pixels per pixel row upward (0 upright).
 */
export function writeText(raster: Raster, x: number, y: number, text: string, scale: number, color: Color, slant = 0) {
  [...text].forEach((character, index) => {
    const glyph = FONT[character];
    if (!glyph) throw new RangeError(`No glyph for ${JSON.stringify(character)}`);
    glyph.forEach((row, j) =>
      [...row].forEach((bit, i) => {
        if (bit !== '1') return;
        const shift = Math.round((6 - j) * scale * slant);
        fillRect(raster, x + (index * 6 + i) * scale + shift, y + j * scale, scale, scale, color);
      }),
    );
  });
}

/** The raster as PNG bytes. */
export function encodePng(raster: Raster): Buffer {
  const png = new PNG({ width: raster.width, height: raster.height });
  raster.pixels.forEach((value, i) => {
    png.data.set(value ? [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255] : [0, 0, 0, 0], i * 4);
  });
  return PNG.sync.write(png);
}

/** A deterministic pseudo-random sequence in [0, 1) from `seed`, for placing repeated details. */
export function sequence(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
