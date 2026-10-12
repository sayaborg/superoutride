import { bands, createRaster, fillEllipse, fillPolygon, fillRect, line, sequence, type Raster } from './raster.js';
import { canvas, footShadow, HORIZON, ink, m, SKY_HEIGHT, SKY_WIDTH } from './kit.js';
import { hills, roundTree, skyOf } from './row2.js';

/** A weeping willow: a broad crown hanging in curtains of fronds. */
function willow(): Raster {
  const r = canvas(9, 9);
  footShadow(r, 7);
  const cx = r.width / 2;
  const next = sequence(51);
  ink(r, (l) => {
    fillRect(l, cx - m(0.3), m(3), m(0.6), r.height - m(3.1), 0x6a5032);
    fillEllipse(l, cx, m(3), m(4), m(2.6), 0x6a9a3c);
    for (let x = m(0.6); x < r.width - m(0.6); x += m(0.45)) {
      const top = m(3) - Math.sqrt(Math.max(0, 1 - ((x - cx) / m(4)) ** 2)) * m(2.0);
      fillRect(l, x, top, m(0.32), r.height - m(1.4) - top - next() * m(1.5), 0x6a9a3c);
    }
  });
  for (let x = m(0.7); x < r.width - m(0.7); x += m(0.45)) fillRect(r, x + m(0.2), m(2.4), m(0.1), m(4.5), 0x4a7a2c);
  fillEllipse(r, cx - m(1.2), m(1.8), m(1.6), m(0.8), 0x90bc58);
  return r;
}

/** A lakeside boathouse on stilts, its roof and doors. */
function boathouse(): Raster {
  const r = canvas(9, 6);
  footShadow(r, 8);
  ink(r, (l) => {
    fillRect(l, m(0.6), m(2.2), m(7.8), m(2.6), 0x8a5a3a);
    fillPolygon(
      l,
      [
        [m(0.1), m(2.4)],
        [m(4.5), m(0.3)],
        [m(8.9), m(2.4)],
      ],
      0x4a5a6a,
    );
    for (const x of [1, 3, 5, 7]) fillRect(l, m(x), m(4.8), m(0.3), m(1.1), 0x5a3a24);
  });
  fillRect(r, m(3.2), m(3.0), m(2.6), m(1.8), 0x3a2a1c);
  for (let x = m(0.6); x < m(8.4); x += m(0.5)) fillRect(r, x, m(2.2), 2, m(2.6), 0x6a442a);
  fillPolygon(
    r,
    [
      [m(4.5), m(0.4)],
      [m(8.8), m(2.35)],
      [m(4.5), m(2.35)],
    ],
    0x3a4858,
  );
  return r;
}

/** Reeds at the water's edge: pass-through scenery. */
function reeds(): Raster {
  const r = canvas(3, 2.2);
  const next = sequence(53);
  for (let k = 0; k < 22; k++) {
    const x = m(0.2) + next() * (r.width - m(0.4)),
      h = m(1 + next() * 1.1);
    line(r, [x, r.height], [x + (next() - 0.5) * m(0.4), r.height - h], 3, next() < 0.5 ? 0x6a8a3a : 0x8aa04a);
    if (next() < 0.4) fillEllipse(r, x, r.height - h + m(0.2), 3, m(0.18), 0x6a4a2a);
  }
  return r;
}

/** A bridge tower: a steel portal frame standing over the road. */
function bridgeTower(): Raster {
  const r = canvas(16, 14);
  const steel = [0x8a2e2a, 0xb83c34, 0xd85a4a] as const;
  ink(r, (l) => {
    for (const x of [0.6, 14.4]) fillRect(l, m(x), 0, m(1.0), r.height, steel[1]);
    for (const y of [0.4, 3.0]) fillRect(l, m(0.6), m(y), m(14.8), m(0.9), steel[1]);
    line(l, [m(1.6), m(1.3)], [m(14.4), m(3.0)], m(0.35), steel[1]);
    line(l, [m(14.4), m(1.3)], [m(1.6), m(3.0)], m(0.35), steel[1]);
  });
  for (const x of [0.6, 14.4]) fillRect(r, m(x) + m(0.65), 0, m(0.35), r.height, steel[0]);
  for (const y of [0.4, 3.0]) fillRect(r, m(0.6), m(y), m(14.8), m(0.2), steel[2]);
  return r;
}

/** A saguaro cactus, arms raised. */
function saguaro(): Raster {
  const r = canvas(3.4, 6.5);
  footShadow(r, 1.6);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - m(0.35), m(0.4), m(0.7), r.height - m(0.5), 0x4a8a3a);
    fillEllipse(l, cx, m(0.45), m(0.35), m(0.35), 0x4a8a3a);
    fillRect(l, cx - m(1.4), m(2.6), m(0.55), m(1.8), 0x4a8a3a);
    fillRect(l, cx - m(1.4), m(4.0), m(1.2), m(0.5), 0x4a8a3a);
    fillEllipse(l, cx - m(1.12), m(2.6), m(0.28), m(0.28), 0x4a8a3a);
    fillRect(l, cx + m(0.85), m(1.8), m(0.55), m(1.9), 0x4a8a3a);
    fillRect(l, cx + m(0.2), m(3.3), m(1.2), m(0.5), 0x4a8a3a);
    fillEllipse(l, cx + m(1.12), m(1.8), m(0.28), m(0.28), 0x4a8a3a);
  });
  for (const x of [cx - m(0.15), cx + m(0.1)]) fillRect(r, x, m(0.6), 2, r.height - m(0.8), 0x2e6a2a);
  fillRect(r, cx - m(0.3), m(0.5), m(0.15), r.height - m(0.7), 0x7ab858);
  return r;
}

/** A mesa: a flat-topped butte, 35 m wide, banded in red rock, far from the road. */
function mesa(): Raster {
  const r = canvas(35, 14);
  // Drawn at half scale on a 70 m × 28 m plan: a whole mesa at 40 texels/m would exceed a sprite master.
  const h = (v: number) => m(v / 2);
  const next = sequence(57);
  ink(r, (l) =>
    fillPolygon(
      l,
      [
        [0, r.height],
        [h(8), h(3)],
        [h(52), h(1.5)],
        [h(70), r.height],
      ],
      0xc06a40,
    ),
  );
  for (let k = 0; k < 6; k++) {
    const y = h(6 + k * 3.6);
    for (let x = 0; x < r.width; x++) if (r.pixels[y * r.width + x]) fillRect(r, x, y, 1, h(0.5), 0xa05634);
  }
  fillPolygon(
    r,
    [
      [h(40), h(1.6)],
      [h(52), h(1.5)],
      [h(70), r.height],
      [h(48), r.height],
    ],
    0x8a4a30,
  );
  for (let k = 0; k < 12; k++)
    fillEllipse(r, h(10) + next() * h(50), h(14) + next() * h(12), h(1.4), h(0.5), 0xd8885a, true);
  return r;
}

/** A wooden telephone pole with its crossarm and insulators. */
function telephonePole(): Raster {
  const r = canvas(2.2, 8);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - m(0.12), m(0.2), m(0.24), r.height - m(0.2), 0x7a5a3a);
    fillRect(l, m(0.1), m(0.8), r.width - m(0.2), m(0.18), 0x7a5a3a);
  });
  for (const x of [0.3, 0.8, 1.4, 1.9]) fillRect(r, m(x) - 2, m(0.62), 4, m(0.18), 0xd8e8f0);
  return r;
}

/** An alpine chalet: wide eaves, a balcony, shutters. */
function chalet(): Raster {
  const r = canvas(10, 8);
  footShadow(r, 9);
  ink(r, (l) => {
    fillRect(l, m(1), m(3.6), m(8), m(4.3), 0xf0e8d8);
    fillRect(l, m(1), m(3.6), m(8), m(2.1), 0x8a5a34);
    fillPolygon(
      l,
      [
        [0, m(3.8)],
        [m(5), m(0.6)],
        [m(10), m(3.8)],
      ],
      0x5a3a2a,
    );
    fillRect(l, m(0.6), m(5.2), m(8.8), m(0.4), 0x6a4228);
  });
  for (const x of [2, 4.4, 6.8]) {
    fillRect(r, m(x), m(6.2), m(1.2), m(1.1), 0x2a3448);
    fillRect(r, m(x) - m(0.3), m(6.2), m(0.3), m(1.1), 0x2a7a3a);
  }
  for (let x = m(0.8); x < m(9.2); x += m(0.5)) fillRect(r, x, m(5.6), 3, m(0.6), 0x6a4228);
  fillPolygon(
    r,
    [
      [m(5), m(0.7)],
      [m(9.8), m(3.75)],
      [m(5), m(3.75)],
    ],
    0x4a2e22,
  );
  fillRect(r, m(1), m(3.8), m(8), m(0.4), 0xf0f0f8);
  return r;
}

/** A snow pole marking the road's edge: red and white bands. */
function snowPole(): Raster {
  const r = canvas(0.5, 2.4);
  ink(r, (l) => fillRect(l, m(0.12), 0, m(0.22), r.height, 0xf0f0f0));
  for (let y = 0; y < r.height; y += m(0.5)) fillRect(r, m(0.12), y, m(0.22), m(0.25), 0xd02828);
  return r;
}

/** Row 4's sprites. */
export const ROW4_SPRITES: Readonly<Record<string, () => Raster>> = {
  willow,
  boathouse,
  reeds,
  'bridge-tower': bridgeTower,
  saguaro,
  mesa,
  'telephone-pole': telephonePole,
  chalet,
  'snow-pole': snowPole,
  'tree-dark': () => roundTree(10, 7, [0x1c4a24, 0x2a5e2c, 0x447a38], 59),
};

/** The lake: a calm pale sky, wooded far shore and the water to the horizon. */
function lakeSky(): Raster {
  const r = skyOf([0x4a90d8, 0x569ade, 0x64a4e2, 0x72aee6, 0x82b8ea, 0x94c2ec, 0xa8ccee, 0xbcd6ee], {
    light: 0xfafcff,
    shade: 0xd6e0ee,
    count: 5,
    seed: 121,
  });
  hills(r, [
    { color: 0x5a8a6a, rim: 0x6a9a78, height: 30, seed: 23 },
    { color: 0x3a6a48, rim: 0x4a7a56, height: 14, seed: 29 },
  ]);
  bands(r, HORIZON, SKY_HEIGHT, [0x3a78b8, 0x3672b0, 0x326ca8]);
  return r;
}

/** The desert: a hot pale sky over red mesas and buttes on a flat horizon. */
function desertSky(): Raster {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, HORIZON, [0x3a7ad0, 0x4a88d4, 0x5c96d6, 0x70a4d8, 0x88b2d6, 0xa2c0d2, 0xbccac8, 0xd8d4bc]);
  const next = sequence(131);
  for (let x = 40; x < SKY_WIDTH; x += 160 + next() * 220) {
    const w = 60 + next() * 140,
      h = 20 + next() * 50;
    fillPolygon(
      r,
      [
        [x, HORIZON + 1],
        [x + w * 0.15, HORIZON - h],
        [x + w * 0.85, HORIZON - h],
        [x + w, HORIZON + 1],
      ],
      0xb06a48,
    );
    fillPolygon(
      r,
      [
        [x + w * 0.6, HORIZON - h],
        [x + w * 0.85, HORIZON - h],
        [x + w, HORIZON + 1],
        [x + w * 0.65, HORIZON + 1],
      ],
      0x8a5038,
    );
  }
  bands(r, HORIZON, SKY_HEIGHT, [0xd8b080, 0xd0a878]);
  return r;
}

/** A dark mountain sky for the pass's wet heights: storm clouds over grey peaks. */
function alpineDarkSky(): Raster {
  const r = skyOf([0x2a2e3a, 0x323642, 0x3a3e4a, 0x424652, 0x4a4e5a, 0x525662, 0x5a5e6a, 0x626672], {
    light: 0x6a6e78,
    shade: 0x3a3e48,
    count: 10,
    seed: 141,
    rim: 0x22262e,
  });
  const next = sequence(143);
  for (let x = -40; x < SKY_WIDTH; x += 90 + next() * 80) {
    const h = 60 + next() * 90;
    fillPolygon(
      r,
      [
        [x, HORIZON + 1],
        [x + 70, HORIZON - h],
        [x + 150, HORIZON + 1],
      ],
      0x5a6270,
    );
    fillPolygon(
      r,
      [
        [x + 70, HORIZON - h],
        [x + 150, HORIZON + 1],
        [x + 80, HORIZON + 1],
      ],
      0x464e5a,
    );
    fillPolygon(
      r,
      [
        [x + 70, HORIZON - h],
        [x + 86, HORIZON - h + 24],
        [x + 54, HORIZON - h + 24],
      ],
      0xc8ccd4,
    );
  }
  bands(r, HORIZON, SKY_HEIGHT, [0x3a4a40, 0x36463c]);
  return r;
}

/** The forest: a soft green-blue sky over a ragged line of treetops. */
function forestSky(): Raster {
  const r = skyOf([0x5a90c0, 0x6698c4, 0x72a2c8, 0x80aacc, 0x8eb4ce, 0x9cbcce, 0xaac4cc, 0xb8cccc], {
    light: 0xf6f8f8,
    shade: 0xd0d8dc,
    count: 5,
    seed: 151,
  });
  const next = sequence(153);
  for (let x = -10; x < SKY_WIDTH; x += 12 + next() * 14) {
    const h = 40 + next() * 60;
    fillPolygon(
      r,
      [
        [x, HORIZON + 2],
        [x + 14, HORIZON - h],
        [x + 28, HORIZON + 2],
      ],
      next() < 0.5 ? 0x1e4a2a : 0x245432,
    );
  }
  bands(r, HORIZON, SKY_HEIGHT, [0x1e4a2a, 0x1c4628]);
  return r;
}

/** Row 4's skies. */
export const ROW4_SKIES: Readonly<Record<string, () => Raster>> = {
  'sky-lake': lakeSky,
  'sky-desert': desertSky,
  'sky-alpine-dark': alpineDarkSky,
  'sky-forest': forestSky,
};
