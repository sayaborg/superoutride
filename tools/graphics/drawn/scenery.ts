import {
  bands,
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  line,
  outlined,
  sequence,
  textWidth,
  writeText,
  type Color,
  type Point,
  type Raster,
} from './raster.js';

import {
  billboard,
  canvas,
  cloud,
  footShadow,
  HORIZON,
  ink,
  INK,
  m,
  rock,
  shrub,
  SKY_HEIGHT,
  SKY_WIDTH,
} from './kit.js';

export { TEXELS_PER_METRE } from './kit.js';
import { ROW2_SKIES, ROW2_SPRITES } from './row2.js';
import { ROW3_SKIES, ROW3_SPRITES } from './row3.js';
import { ROW4_SKIES, ROW4_SPRITES } from './row4.js';

/** Two pillars and a banner across the road, its text in block letters: a checkpoint or goal arch. */
function arch(text: string, banner: Color, letters: Color, check: boolean): Raster {
  const r = canvas(15, 8);
  const pillar = (x: number) =>
    ink(r, (l) => {
      fillRect(l, x, m(1.6), m(0.7), r.height - m(1.6), 0xe8e8f0);
      for (let y = m(1.8); y < r.height; y += m(1.2)) fillRect(l, x, y, m(0.7), m(0.6), 0xd02828);
      fillRect(l, x + m(0.5), m(1.6), m(0.2), r.height - m(1.6), 0xb0b0c0);
    });
  pillar(m(0.3));
  pillar(r.width - m(1.0));
  ink(r, (l) => {
    fillRect(l, m(0.1), m(0.2), r.width - m(0.2), m(1.8), banner);
    if (check)
      for (let x = 0; x < r.width; x += m(0.45))
        for (const row of [0, 1])
          fillRect(
            l,
            m(0.1) + x,
            m(0.2) + row * m(0.25) + (row ? 0 : 0),
            m(0.225),
            m(0.25),
            (x / m(0.45)) % 2 === row ? 0x101010 : 0xf0f0f0,
          );
    fillRect(l, m(0.1), m(1.72), r.width - m(0.2), m(0.28), 0x203080);
  });
  const scale = Math.min(9, Math.floor((r.width * 0.86) / (text.length * 6 - 1)));
  const x = Math.round((r.width - textWidth(text, scale)) / 2),
    y = m(1.1) - Math.round((7 * scale) / 2) + (check ? m(0.25) : 0);
  writeText(r, x + 3, y + 3, text, scale, 0x101030);
  writeText(r, x, y, text, scale, letters);
  return r;
}

/** A palm `height` metres tall, its crown leaning `lean` metres (negative left). */
function palm(height: number, lean: number, seed: number): Raster {
  const r = canvas(10, height + 2.5);
  footShadow(r, 2.2);
  const base: Point = [r.width / 2, r.height - m(0.1)],
    top: Point = [r.width / 2 + m(lean), r.height - m(height)];
  const trunk = (t: number): Point => [base[0] + (top[0] - base[0]) * t * t, base[1] + (top[1] - base[1]) * t];
  outlined(
    r,
    INK,
    (l) => {
      for (let i = 0; i < 16; i++) line(l, trunk(i / 16), trunk((i + 1) / 16), m(0.46 - 0.18 * (i / 16)), 0x9a7048);
    },
    2,
  );
  // The trunk's rings and its shaded right side.
  for (let i = 0; i < 16; i++) {
    const [x0, y0] = trunk(i / 16),
      [x1, y1] = trunk((i + 1) / 16);
    line(r, [x0 + m(0.1), y0], [x1 + m(0.1), y1], m(0.12), 0x7a5634);
    if (i % 2) line(r, trunk(i / 16 - 0.008), trunk(i / 16 + 0.008), m(0.3), 0x6c4a2c);
  }
  const next = sequence(seed);
  // Fronds: thick curved leaves from the crown, rising outward and drooping under their weight; light above, dark
  // beneath.
  const frond = (l: Raster, angle: number, length: number, upper: Color, lower: Color) => {
    const at = (t: number): Point => [
      top[0] + Math.sin(angle) * length * t,
      top[1] - Math.cos(angle) * length * t + length * 0.95 * t * t,
    ];
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12,
        t1 = (i + 1) / 12,
        w = m(0.55) * (1 - t0 * 0.85);
      const [a, b] = [at(t0), at(t1)];
      fillPolygon(
        l,
        [
          [a[0], a[1] - w / 2],
          [b[0], b[1] - w / 2],
          [b[0], b[1]],
          [a[0], a[1]],
        ],
        upper,
      );
      fillPolygon(
        l,
        [
          [a[0], a[1]],
          [b[0], b[1]],
          [b[0], b[1] + w / 2],
          [a[0], a[1] + w / 2],
        ],
        lower,
      );
    }
  };
  outlined(
    r,
    INK,
    (l) => {
      for (const angle of [-2.2, -1.65, -1.15, -0.55, 0.55, 1.15, 1.65, 2.2])
        frond(l, angle, m(3.4 + next() * 0.7), 0x48b040, 0x24702c);
      for (const angle of [-0.25, 0.25]) frond(l, angle, m(2.2), 0x58c048, 0x2e8034);
      fillEllipse(l, top[0], top[1] + m(0.25), m(0.5), m(0.4), 0x5a4020);
    },
    2,
  );
  return r;
}

/** A beach hut: plank walls, a striped awning and a thatched roof. */
function beachHut(): Raster {
  const r = canvas(6.5, 5);
  footShadow(r, 6.2);
  ink(r, (l) => {
    fillRect(l, m(0.6), m(2.2), m(5.3), m(2.7), 0xe8d0a0);
    for (let x = m(0.6); x < m(5.9); x += m(0.5)) fillRect(l, x, m(2.2), 2, m(2.7), 0xc8a878);
    fillRect(l, m(2.6), m(3.0), m(1.3), m(1.9), 0x60402c);
    fillRect(l, m(1.0), m(2.8), m(1.1), m(0.9), 0x70c0e8);
    fillRect(l, m(4.4), m(2.8), m(1.1), m(0.9), 0x70c0e8);
    fillPolygon(
      l,
      [
        [m(0.1), m(2.3)],
        [m(3.25), m(0.4)],
        [m(6.4), m(2.3)],
      ],
      0xd8b060,
    );
    fillPolygon(
      l,
      [
        [m(3.25), m(0.4)],
        [m(6.4), m(2.3)],
        [m(3.25), m(2.3)],
      ],
      0xb08838,
    );
  });
  for (let x = m(0.6), k = 0; x < m(5.9); x += m(0.53), k++)
    fillRect(r, x, m(2.3), m(0.53), m(0.35), k % 2 ? 0xe8e8f0 : 0x2858c8);
  return r;
}

/** A lighthouse on a rock: a white tower with red bands, its lamp room and gallery. */
function lighthouse(): Raster {
  const r = canvas(7, 18);
  footShadow(r, 6.5);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillEllipse(l, cx, r.height - m(1.0), m(3.3), m(1.2), 0x707a88);
    fillRect(l, cx - m(3.3), r.height - m(1.0), m(6.6), m(1.0), 0x707a88);
    fillPolygon(
      l,
      [
        [cx - m(1.7), r.height - m(1.6)],
        [cx - m(1.1), m(3.4)],
        [cx + m(1.1), m(3.4)],
        [cx + m(1.7), r.height - m(1.6)],
      ],
      0xf0f0f0,
    );
    fillRect(l, cx - m(1.6), m(2.9), m(3.2), m(0.5), 0x303040);
    fillRect(l, cx - m(0.9), m(1.4), m(1.8), m(1.5), 0xf8e070);
    fillPolygon(
      l,
      [
        [cx - m(1.2), m(1.5)],
        [cx, m(0.3)],
        [cx + m(1.2), m(1.5)],
      ],
      0xc02828,
    );
  });
  for (const y of [5.6, 9.6, 13.6]) {
    const t = (y - 3.4) / (16.4 - 3.4);
    const half = m(1.1 + 0.6 * t);
    fillRect(r, cx - half + 1, m(y), half * 2 - 2, m(1.4), 0xd02828);
  }
  fillRect(r, cx - m(0.1), m(3.4), m(0.5), r.height - m(5.0), 0xd0d0d8);
  fillRect(r, cx - m(0.9), m(1.4), m(0.3), m(1.5), 0xfff8c0);
  fillEllipse(r, cx - m(1.6), r.height - m(1.3), m(0.9), m(0.5), 0x525a68);
  return r;
}

/** A beach parasol on its pole. */
function parasol(color: Color, stripe: Color): Raster {
  const r = canvas(3, 3);
  footShadow(r, 1.6);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - 2, m(0.8), 4, r.height - m(0.8), 0xd8d8d0);
    fillPolygon(
      l,
      [
        [m(0.1), m(1.2)],
        [cx, m(0.2)],
        [r.width - m(0.1), m(1.2)],
      ],
      color,
    );
  });
  for (let k = 0; k < 6; k += 2) {
    const x0 = m(0.1) + (k * (r.width - m(0.2))) / 6,
      x1 = m(0.1) + ((k + 1) * (r.width - m(0.2))) / 6;
    fillPolygon(
      r,
      [
        [x0 + 1, m(1.2) - 1],
        [cx, m(0.25)],
        [x1, m(1.2) - 1],
      ],
      stripe,
    );
  }
  return r;
}

/** Every drawn OUTRUN TEST sprite by name. */
export const SPRITES: Readonly<Record<string, () => Raster>> = {
  'arch-checkpoint': () => arch('CHECKPOINT', 0x2850c8, 0xf8e040, false),
  'arch-goal': () => arch('GOAL', 0xd02020, 0xf8f8f8, true),
  'palm-tall': () => palm(11, 1.2, 11),
  'palm-bent': () => palm(9, -2.0, 23),
  'beach-hut': beachHut,
  lighthouse,
  'parasol-red': () => parasol(0xe03030, 0xf0f0f0),
  'parasol-blue': () => parasol(0x2860d8, 0xf8e040),
  'shore-rock': () => rock(4.5, 2.6, [0x4a4e5c, 0x6a6e7c, 0x9298a8], 7),
  'coast-shrub': () => shrub(2.4, [0x1c4a20, 0x2e7a30, 0x58a840], 5),
  'billboard-coast': () => billboard('OUTRUN', 0xf8f0e0, 0xd02828, 0x2858c8),
  ...ROW2_SPRITES,
  ...ROW3_SPRITES,
  ...ROW4_SPRITES,
};

/** A sunny coast: banded blue sky, white clouds, the sea to the horizon and far islands. */
function coastSky(): Raster {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, HORIZON, [0x1050c8, 0x1a5cd0, 0x2468d8, 0x3078e0, 0x3c88e8, 0x4c98ec, 0x5ca8f0, 0x70b8f4, 0x88c8f8]);
  const next = sequence(3);
  for (let k = 0; k < 7; k++)
    cloud(r, 40 + k * 215 + next() * 60, 262 + next() * 34, 70 + next() * 60, 10 + k, 0xf8f8ff, 0xc8d4ec);
  // Islands on the horizon.
  for (const [x, w, h] of [
    [180, 150, 12],
    [700, 70, 7],
    [1100, 190, 16],
  ] as const)
    outlined(r, 0x2a4a58, (l) => fillEllipse(l, x, HORIZON, w / 2, h, 0x4a7a70));
  bands(r, HORIZON - 2, SKY_HEIGHT, [0x1c58a8, 0x1a50a0, 0x184898, 0x164090]);
  for (let k = 0; k < 40; k++)
    fillRect(r, next() * SKY_WIDTH, HORIZON + 4 + next() * 40, 10 + next() * 30, 1, 0x6aa0e0);
  return r;
}

/** Every drawn OUTRUN TEST sky by name. */
export const SKIES: Readonly<Record<string, () => Raster>> = {
  'sky-coast': coastSky,
  ...ROW2_SKIES,
  ...ROW3_SKIES,
  ...ROW4_SKIES,
};
