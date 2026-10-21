import {
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  outlined,
  sequence,
  textWidth,
  writeText,
  type Color,
  type Point,
  type Raster,
} from './raster.js';

/**
 * Drawn pictures, at the picture contract's 40 texels per metre, each standing on its base point at the middle of its
 * bottom row: the period's arcade look, outlined shapes with three tones of light, at most 15
 * colors a picture. Objects that stand on the ground carry a flat contact shadow at their foot.
 */
export const TEXELS_PER_METRE = 40;
export const m = (metres: number) => Math.round(metres * TEXELS_PER_METRE);
export const INK = 0x1a1424;
export const SHADOW = 0x2a2c30;

/** Draw shapes with the scenery's two-pixel ink outline. */
export const ink = (r: Raster, draw: (layer: Raster) => void) => outlined(r, INK, draw, 2);

/** A picture `width` × `height` metres. */
export const canvas = (width: number, height: number) => createRaster(m(width), m(height));

/** The contact shadow at a picture's foot: a flat ellipse `width` metres wide. */
export function footShadow(r: Raster, width: number) {
  fillEllipse(r, r.width / 2, r.height - m(0.12), m(width) / 2, m(0.14), SHADOW);
}

/** A rock: an angular outcrop in three tones, `width` × `height` metres. */
export function rock(width: number, height: number, tones: readonly [Color, Color, Color], seed: number): Raster {
  const r = canvas(width, height);
  footShadow(r, width * 0.95);
  const next = sequence(seed);
  const points: Point[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      x = m(0.1) + t * (r.width - m(0.2)),
      peak = Math.sin(t * Math.PI) ** 0.6;
    points.push([x, r.height - m(0.1) - peak * (r.height - m(0.4)) * (0.75 + 0.25 * next())]);
  }
  const outline = [...points, [r.width - m(0.1), r.height - m(0.1)] as Point, [m(0.1), r.height - m(0.1)] as Point];
  ink(r, (l) => fillPolygon(l, outline, tones[1]));
  // Light on the left faces, shade on the right.
  for (let i = 0; i < n; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    const lit = i < n / 2;
    fillPolygon(r, [a, b, [b[0], r.height - m(0.15)], [a[0], r.height - m(0.15)]], lit ? tones[2] : tones[0]);
    fillPolygon(r, [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + m(height * 0.18)]], tones[1]);
  }
  return r;
}

/** A low shrub, pass-through scenery. */
export function shrub(width: number, colors: readonly [Color, Color, Color], seed: number): Raster {
  const r = canvas(width, width * 0.55);
  const next = sequence(seed);
  ink(r, (l) => {
    for (let i = 0; i < 6; i++)
      fillEllipse(
        l,
        m(0.4) + next() * (r.width - m(0.8)),
        r.height - m(0.3) - next() * r.height * 0.4,
        m(width * 0.22),
        m(width * 0.18),
        colors[1],
      );
  });
  for (let i = 0; i < 5; i++)
    fillEllipse(
      r,
      m(0.5) + next() * (r.width - m(1)),
      r.height * 0.35 + next() * r.height * 0.2,
      m(width * 0.08),
      m(width * 0.06),
      colors[2],
    );
  for (let x = 0; x < r.width; x++)
    if (r.pixels[(r.height - 3) * r.width + x]) fillRect(r, x, r.height - 3, 1, 2, colors[0]);
  return r;
}

/** A roadside billboard on two posts with its message. */
export function billboard(text: string, board: Color, letters: Color, accent: Color): Raster {
  const r = canvas(8, 6);
  footShadow(r, 6);
  ink(r, (l) => {
    fillRect(l, m(1.2), m(3), m(0.3), m(3), 0x808890);
    fillRect(l, m(6.5), m(3), m(0.3), m(3), 0x808890);
    fillRect(l, m(0.2), m(0.2), m(7.6), m(3.2), board);
  });
  fillRect(r, m(0.2), m(2.7), m(7.6), m(0.5), accent);
  const scale = Math.min(6, Math.floor(m(7) / (text.length * 6 - 1)));
  writeText(r, Math.round((r.width - textWidth(text, scale)) / 2), m(1.4) - (7 * scale) / 2, text, scale, letters);
  return r;
}

/** A sky's width and height in pixels: 94 × 40 tiles, 359 degrees at the product's focal length. */
export const SKY_WIDTH = 1504;
export const SKY_HEIGHT = 640;
export const HORIZON = 320;

/** A cartoon cloud of overlapping puffs, outlined, light above and shaded beneath. */
export function cloud(
  r: Raster,
  x: number,
  y: number,
  width: number,
  seed: number,
  light: Color,
  shade: Color,
  rim: Color = 0x5a78b8,
) {
  const next = sequence(seed);
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    puffs.push([
      x + t * width,
      y - Math.sin(t * Math.PI) * width * 0.16 * (0.7 + 0.5 * next()),
      width * (0.1 + 0.07 * next()),
    ]);
  }
  outlined(r, rim, (l) => {
    for (const [px, py, pr] of puffs) fillEllipse(l, px, py, pr, pr * 0.8, light);
    fillEllipse(l, x + width / 2, y - width * 0.04, width * 0.52, width * 0.13, light);
    fillRect(l, x - width * 0.05, y, width * 1.1, width * 0.08, light);
  });
  fillRect(r, x - width * 0.05, y + width * 0.05, width * 1.1, width * 0.03, shade);
  for (const [px, py, pr] of puffs) fillEllipse(r, px + pr * 0.15, py + pr * 0.35, pr * 0.6, pr * 0.25, shade);
}
