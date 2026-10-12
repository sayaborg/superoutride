import {
  bands,
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  sequence,
  type Color,
  type Raster,
} from './raster.js';
import { canvas, cloud, footShadow, HORIZON, ink, m, rock, SKY_HEIGHT, SKY_WIDTH } from './kit.js';

/** A broadleaf tree: a trunk under a crown of overlapping round masses, light from the upper left. */
export function roundTree(height: number, width: number, greens: readonly [Color, Color, Color], seed: number): Raster {
  const r = canvas(width, height);
  footShadow(r, width * 0.7);
  const next = sequence(seed);
  const cx = r.width / 2,
    crownY = r.height - m(height * 0.62);
  const masses: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    masses.push([
      cx + Math.cos(a) * m(width * 0.26) * (0.7 + 0.3 * next()),
      crownY + Math.sin(a) * m(height * 0.2) * (0.7 + 0.3 * next()),
      m(width * (0.2 + 0.06 * next())),
    ]);
  }
  masses.push([cx, crownY, m(width * 0.3)]);
  ink(r, (l) => {
    fillRect(l, cx - m(0.25), crownY, m(0.5), r.height - crownY - m(0.1), 0x7a5232);
    for (const [x, y, rad] of masses) fillEllipse(l, x, y, rad, rad * 0.9, greens[1]);
  });
  fillRect(r, cx + m(0.05), crownY + m(height * 0.25), m(0.2), r.height - crownY - m(height * 0.25) - m(0.1), 0x5a3a22);
  // Shade below and right, light above and left.
  for (const [x, y, rad] of masses) {
    fillEllipse(r, x + rad * 0.2, y + rad * 0.3, rad * 0.75, rad * 0.55, greens[0]);
    fillEllipse(r, x - rad * 0.25, y - rad * 0.25, rad * 0.45, rad * 0.4, greens[2]);
  }
  return r;
}

/** A cypress: a tall narrow flame of dark green. */
function cypress(): Raster {
  const r = canvas(2.6, 10);
  footShadow(r, 1.8);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillPolygon(
      l,
      [
        [cx, m(0.1)],
        [cx + m(1.15), m(5.5)],
        [cx + m(0.8), r.height - m(0.7)],
        [cx - m(0.8), r.height - m(0.7)],
        [cx - m(1.15), m(5.5)],
      ],
      0x2a6a34,
    );
    fillRect(l, cx - m(0.15), r.height - m(0.8), m(0.3), m(0.7), 0x6a4a2a);
  });
  fillPolygon(
    r,
    [
      [cx, m(0.3)],
      [cx + m(1.0), m(5.5)],
      [cx + m(0.7), r.height - m(0.8)],
      [cx + m(0.1), r.height - m(0.8)],
    ],
    0x1c4e28,
  );
  for (let y = m(1.5); y < r.height - m(1.2); y += m(1.1)) fillEllipse(r, cx - m(0.4), y, m(0.25), m(0.4), 0x3c8a40);
  return r;
}

/** A stone gate over the road: two crenellated towers joined by an arched span, its opening `opening` metres wide. */
function stoneGate(opening: number): Raster {
  const tower = 3.4,
    width = opening + 2 * tower,
    height = 13;
  const r = canvas(width, height);
  const stone = [0x8c7c64, 0xb0a084, 0xd0c4a4] as const;
  const left = m(tower),
    right = r.width - m(tower),
    cx = r.width / 2,
    half = (right - left) / 2;
  const spanTop = m(1.6),
    crown = m(3.8),
    springing = m(7);
  // The span's underside: an elliptical arch from the towers' springing up to its crown.
  const underside = (x: number) => springing - (springing - crown) * Math.sqrt(Math.max(0, 1 - ((x - cx) / half) ** 2));
  ink(r, (l) => {
    for (const x of [0, right]) {
      fillRect(l, x, m(1), m(tower), r.height - m(1), stone[1]);
      for (let k = 0; k < 3; k++) fillRect(l, x + k * m(1.2), 0, m(0.8), m(1.2), stone[1]);
    }
    for (let x = left; x < right; x++) fillRect(l, x, spanTop, 1, underside(x + 0.5) - spanTop, stone[1]);
  });
  // The arch's rim of light voussoirs, the keystone, coursing lines and the towers' shaded faces.
  for (let x = left; x < right; x++) fillRect(r, x, underside(x + 0.5) - m(0.45), 1, m(0.45), stone[2]);
  for (let x = left + m(1.2); x < right; x += m(1.2)) fillRect(r, x, underside(x) - m(0.45), 3, m(0.45), stone[0]);
  fillRect(r, cx - m(0.7), crown - m(1.2), m(1.4), m(1.2), stone[2]);
  for (let y = spanTop + m(0.8); y < crown - m(0.3); y += m(0.8)) fillRect(r, left, y, right - left, 3, stone[0]);
  for (const x of [0, right]) {
    fillRect(r, x + m(tower * 0.62), m(1), m(tower * 0.38), r.height - m(1), stone[0]);
    for (let y = m(2); y < r.height; y += m(1.0)) fillRect(r, x, y, m(tower), 3, stone[0]);
    fillRect(r, x + m(1.1), m(3.5), m(1.0), m(1.6), 0x2a2430);
  }
  return r;
}

/** A classic street lamp: a fluted post and a lantern. */
function classicLamp(): Raster {
  const r = canvas(1.4, 5.2);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - m(0.1), m(0.9), m(0.2), r.height - m(1.3), 0x2a3a48);
    fillRect(l, cx - m(0.3), r.height - m(0.5), m(0.6), m(0.45), 0x2a3a48);
    fillPolygon(
      l,
      [
        [cx - m(0.45), m(0.3)],
        [cx + m(0.45), m(0.3)],
        [cx + m(0.3), m(1.0)],
        [cx - m(0.3), m(1.0)],
      ],
      0xf8e8a0,
    );
    fillPolygon(
      l,
      [
        [cx - m(0.55), m(0.32)],
        [cx, m(0.02)],
        [cx + m(0.55), m(0.32)],
      ],
      0x2a3a48,
    );
  });
  fillRect(r, cx + m(0.1), m(0.35), m(0.15), m(0.6), 0xd8c070);
  return r;
}

/** A low flower bed: a stone kerb holding red and yellow flowers. */
function flowerBed(): Raster {
  const r = canvas(3.2, 1.0);
  const next = sequence(17);
  ink(r, (l) => {
    fillRect(l, m(0.1), m(0.55), r.width - m(0.2), m(0.4), 0xb0a084);
    fillEllipse(l, r.width / 2, m(0.5), r.width / 2 - m(0.2), m(0.32), 0x3a7a30);
  });
  for (let i = 0; i < 26; i++)
    fillEllipse(
      r,
      m(0.35) + next() * (r.width - m(0.7)),
      m(0.3) + next() * m(0.35),
      3,
      3,
      next() < 0.5 ? 0xe03038 : 0xf8d040,
    );
  fillRect(r, m(0.1), m(0.85), r.width - m(0.2), 3, 0x8c7c64);
  return r;
}

/** A curve warning: a black and yellow chevron board on a post, pointing `to`. */
function chevron(to: 'left' | 'right'): Raster {
  const r = canvas(1.8, 2.6);
  ink(r, (l) => {
    fillRect(l, r.width / 2 - m(0.06), m(1.2), m(0.12), m(1.4), 0x9098a0);
    fillRect(l, m(0.1), m(0.1), r.width - m(0.2), m(1.2), 0xf8d020);
  });
  for (const k of [0, 1]) {
    const x0 = m(0.35) + k * m(0.55),
      dir = to === 'right' ? 1 : -1,
      [a, b] = dir > 0 ? [x0, x0 + m(0.4)] : [x0 + m(0.4), x0];
    fillPolygon(
      r,
      [
        [a, m(0.25)],
        [b, m(0.7)],
        [a, m(1.15)],
        [a + dir * m(0.18), m(1.15)],
        [b + dir * m(0.18), m(0.7)],
        [a + dir * m(0.18), m(0.25)],
      ],
      0x181820,
    );
  }
  return r;
}

/** Row 2's sprites. */
export const ROW2_SPRITES: Readonly<Record<string, () => Raster>> = {
  'tree-round': () => roundTree(8, 6.5, [0x2a6a2c, 0x3c8c34, 0x68b048], 31),
  'tree-round-lime': () => roundTree(6.5, 5.5, [0x4a7a20, 0x6a9c28, 0xa0c848], 37),
  cypress,
  'stone-gate': () => stoneGate(20),
  'lamp-classic': classicLamp,
  'flower-bed': flowerBed,
  'chevron-left': () => chevron('left'),
  'chevron-right': () => chevron('right'),
  'cliff-rock': () => rock(8, 5.5, [0x5a4a42, 0x806a5a, 0xaa947c], 41),
  'sea-stack': () => rock(5, 9, [0x4a4048, 0x6e626a, 0x948890], 43),
};

/** A banded sky with clouds, `ground` drawn below the horizon. */
export function skyOf(
  colors: readonly Color[],
  clouds: { light: Color; shade: Color; count: number; seed: number; rim?: Color } | null,
) {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, HORIZON, colors);
  if (clouds) {
    const next = sequence(clouds.seed);
    for (let k = 0; k < clouds.count; k++)
      cloud(
        r,
        30 + (k * SKY_WIDTH) / clouds.count + next() * 60,
        262 + next() * 34,
        60 + next() * 60,
        clouds.seed + k,
        clouds.light,
        clouds.shade,
        clouds.rim,
      );
  }
  return r;
}

/** Rolling hills along the horizon: `layers` of round crests, farther ones paler. */
export function hills(r: Raster, layers: readonly { color: Color; rim: Color; height: number; seed: number }[]) {
  for (const layer of layers) {
    const next = sequence(layer.seed);
    const crest = (x: number) =>
      HORIZON -
      layer.height *
        (0.55 +
          0.25 * Math.sin((x / SKY_WIDTH) * Math.PI * 6 + layer.seed) +
          0.2 * Math.sin((x / SKY_WIDTH) * Math.PI * 14 + next() * 0));
    for (let x = 0; x < SKY_WIDTH; x++) {
      const top = Math.round(crest(x));
      fillRect(r, x, top, 1, HORIZON + 40 - top, layer.color);
      fillRect(r, x, top, 1, 2, layer.rim);
    }
  }
}

/** Countryside: a soft blue sky with fair clouds over rolling green hills. */
function countrySky(): Raster {
  const r = skyOf([0x3a78d0, 0x4684d8, 0x5490e0, 0x629ce6, 0x72a8ec, 0x84b6f0, 0x98c4f4, 0xb0d4f6], {
    light: 0xf8f8ff,
    shade: 0xd0d8ec,
    count: 6,
    seed: 61,
  });
  hills(r, [
    { color: 0x7aa868, rim: 0x98c080, height: 46, seed: 3 },
    { color: 0x4e8a40, rim: 0x68a050, height: 26, seed: 7 },
  ]);
  bands(r, HORIZON, SKY_HEIGHT, [0x4e8a40, 0x488438]);
  return r;
}

/** The cliff coast in the afternoon: a warm pale sky, a headland's cliffs on the sea's horizon. */
function cliffSky(): Raster {
  const r = skyOf([0x4a88c8, 0x5a94cc, 0x6aa0d0, 0x7cacd4, 0x90b8d6, 0xa6c4d4, 0xbccecc, 0xd2d6c0], {
    light: 0xfff4e8,
    shade: 0xe0ccc0,
    count: 4,
    seed: 71,
  });
  const next = sequence(5);
  for (const [x, w, h] of [
    [260, 300, 60],
    [900, 420, 80],
  ] as const) {
    fillPolygon(
      r,
      [
        [x, HORIZON],
        [x + 20, HORIZON - h],
        [x + w * 0.7, HORIZON - h - 8],
        [x + w, HORIZON],
      ],
      0x8a7868,
    );
    fillPolygon(
      r,
      [
        [x + w * 0.55, HORIZON - h - 6],
        [x + w * 0.7, HORIZON - h - 8],
        [x + w, HORIZON],
        [x + w * 0.62, HORIZON],
      ],
      0x6a5a50,
    );
    fillRect(r, x + 20, HORIZON - h - 4, w * 0.68, 5, 0x6a9a50);
  }
  bands(r, HORIZON - 1, SKY_HEIGHT, [0x2a68a8, 0x2660a0, 0x225898]);
  for (let k = 0; k < 50; k++) fillRect(r, next() * SKY_WIDTH, HORIZON + 3 + next() * 40, 8 + next() * 24, 1, 0x7aa8d8);
  return r;
}

/** Overcast: low grey bands and dark cloud masses over a grey horizon, for wet sections. */
function overcastSky(): Raster {
  const r = skyOf([0x4a5058, 0x545a62, 0x5e646c, 0x686e76, 0x727880, 0x7c828a, 0x868c92, 0x90969a], {
    light: 0x9aa0a6,
    shade: 0x5a6068,
    count: 9,
    seed: 81,
    rim: 0x40464e,
  });
  hills(r, [{ color: 0x5a6660, rim: 0x6a7670, height: 30, seed: 11 }]);
  bands(r, HORIZON, SKY_HEIGHT, [0x4a5650, 0x46524c]);
  return r;
}

/** Row 2's skies. */
export const ROW2_SKIES: Readonly<Record<string, () => Raster>> = {
  'sky-country': countrySky,
  'sky-cliff': cliffSky,
  'sky-overcast': overcastSky,
};
