import {
  bands,
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  line,
  sequence,
  textWidth,
  writeText,
  type Color,
  type Raster,
} from './raster.js';
import { canvas, cloud, footShadow, HORIZON, ink, m, SKY_HEIGHT, SKY_WIDTH } from './kit.js';
import { skyOf } from './row2.js';

/** Spectators behind a crowd barrier: rows of heads and shirts, arms raised here and there. */
function spectators(): Raster {
  const r = canvas(8, 2.6);
  const next = sequence(61);
  const shirts = [0xd83030, 0xf0f0f0, 0x2858c8, 0xf0c020, 0x30a050, 0xe07030, 0x8a50b0];
  const skins = [0xf0c8a0, 0xd8a078, 0xa87050];
  for (const [row, base] of [
    [0, m(1.6)],
    [1, m(2.0)],
  ] as const)
    for (let x = m(0.2) + row * m(0.25); x < r.width - m(0.3); x += m(0.5)) {
      const y = base - next() * m(0.15);
      ink(r, (l) => {
        fillRect(l, x - m(0.18), y - m(0.6), m(0.36), m(0.8), shirts[Math.floor(next() * shirts.length)]!);
        fillEllipse(l, x, y - m(0.78), m(0.13), m(0.15), skins[Math.floor(next() * skins.length)]!);
      });
      if (next() < 0.2) line(r, [x + m(0.15), y - m(0.55)], [x + m(0.3), y - m(1.1)], m(0.08), 0xf0c8a0);
    }
  ink(r, (l) => fillRect(l, 0, m(1.7), r.width, m(0.9), 0xe8e8f0));
  for (let x = 0; x < r.width; x += m(1)) fillRect(r, x, m(1.75), m(0.5), m(0.8), 0xd02828);
  return r;
}

/** A seafront hotel: white floors of balconies with blue shutters under a flat roof and its sign. */
function hotel(): Raster {
  const r = canvas(14, 18);
  footShadow(r, 13.5);
  ink(r, (l) => fillRect(l, m(0.3), m(1.6), m(13.4), r.height - m(1.7), 0xf0ece0));
  for (let f = 0; f < 5; f++) {
    const y = m(3.4 + f * 2.9);
    fillRect(r, m(0.3), y + m(1.4), m(13.4), m(0.25), 0xc8c0b0);
    for (let x = 1; x < 13; x += 2.4) {
      fillRect(r, m(x), y, m(1.4), m(1.4), 0x2a4870);
      fillRect(r, m(x) - m(0.3), y, m(0.25), m(1.4), 0x3a78c0);
      fillRect(r, m(x) + m(1.45), y, m(0.25), m(1.4), 0x3a78c0);
      fillRect(r, m(x) - m(0.2), y + m(1.1), m(1.8), m(0.08), 0x8a8a90);
    }
  }
  fillRect(r, m(12.4), m(1.6), m(1.3), r.height - m(1.7), 0xd0c8b8);
  fillRect(r, m(5.5), r.height - m(2.2), m(3), m(2.1), 0x3a2a24);
  ink(r, (l) => fillRect(l, m(3.5), m(0.2), m(7), m(1.3), 0x1c3a6a));
  const text = 'HOTEL';
  writeText(r, Math.round((r.width - textWidth(text, 6)) / 2), m(0.42), text, 6, 0xf8e040);
  return r;
}

/** A yacht at anchor: a white hull, its mast and a full sail. */
function yacht(): Raster {
  const r = canvas(9, 10);
  ink(r, (l) => {
    fillPolygon(
      l,
      [
        [m(0.2), m(8.4)],
        [m(8.8), m(8.4)],
        [m(7.6), m(9.8)],
        [m(1.2), m(9.8)],
      ],
      0xf4f4f8,
    );
    fillRect(l, m(4.3), m(0.4), m(0.2), m(8.1), 0x8a8a90);
    fillPolygon(
      l,
      [
        [m(4.1), m(0.6)],
        [m(4.1), m(8.1)],
        [m(0.8), m(8.1)],
      ],
      0xf8f8f0,
    );
    fillPolygon(
      l,
      [
        [m(4.7), m(1.4)],
        [m(4.7), m(8.1)],
        [m(7.6), m(8.1)],
      ],
      0xe8e4d8,
    );
  });
  fillRect(r, m(0.3), m(8.9), m(8.4), m(0.2), 0x2858c8);
  return r;
}

/** A highway overpass: a concrete deck on two piers, wide enough to span the road, its parapet and shadowed soffit. */
function overpass(): Raster {
  const r = canvas(34, 8);
  ink(r, (l) => {
    fillRect(l, 0, m(1.4), r.width, m(2.2), 0xb8b4a8);
    for (const x of [0.6, 31.4]) fillRect(l, m(x), m(3.6), m(2), r.height - m(3.6), 0xa8a498);
  });
  fillRect(r, 0, m(1.4), r.width, m(0.5), 0xd8d4c8);
  fillRect(r, 0, m(3.1), r.width, m(0.5), 0x6a6860);
  for (let x = 0; x < r.width; x += m(2)) fillRect(r, x, m(1.9), 2, m(1.2), 0x9a968a);
  for (const x of [0.6, 31.4]) fillRect(r, m(x) + m(1.4), m(3.6), m(0.6), r.height - m(3.6), 0x84807a);
  ink(r, (l) => {
    for (let x = m(0.4); x < r.width - m(0.2); x += m(1.2)) fillRect(l, x, m(0.5), m(0.12), m(0.9), 0x9098a4);
    fillRect(l, 0, m(0.4), r.width, m(0.18), 0xc8ccd4);
  });
  return r;
}

/** An overhead sign gantry: a steel truss with two green direction boards. */
function signGantry(): Raster {
  const r = canvas(22, 8.5);
  ink(r, (l) => {
    for (const x of [0.3, 21.3]) fillRect(l, m(x), m(1), m(0.4), r.height - m(1), 0x8a9098);
    fillRect(l, 0, m(1), r.width, m(0.4), 0x8a9098);
    fillRect(l, m(2.5), m(1.5), m(7.5), m(2.8), 0x1a7a3a);
    fillRect(l, m(12), m(1.5), m(7.5), m(2.8), 0x1a7a3a);
  });
  for (let x = m(0.4); x < r.width; x += m(0.8)) line(r, [x, m(1)], [x + m(0.4), m(1.4)], 2, 0x6a7078);
  for (const [x, text] of [
    [2.5, 'CITY'],
    [12, 'GOAL'],
  ] as const) {
    fillRect(r, m(x) + m(0.15), m(1.65), m(7.2), m(2.5), 0x1a7a3a);
    fillRect(r, m(x) + m(0.15), m(1.65), m(7.2), 3, 0xf0f0f0);
    writeText(r, m(x) + Math.round((m(7.5) - textWidth(text, 7)) / 2), m(2.1), text, 7, 0xf8f8f8);
    fillPolygon(
      r,
      [
        [m(x + 3.75), m(3.6)],
        [m(x + 3.35), m(3.95)],
        [m(x + 4.15), m(3.95)],
      ],
      0xf8f8f8,
    );
  }
  return r;
}

/** A highway lamp: a tall grey mast with a long arm over the road. */
function highwayLamp(): Raster {
  const r = canvas(3.4, 11);
  ink(r, (l) => {
    fillRect(l, m(0.3), m(0.6), m(0.25), r.height - m(0.6), 0x9098a0);
    fillRect(l, m(0.3), m(0.5), m(2.8), m(0.18), 0x9098a0);
    fillRect(l, m(2.4), m(0.55), m(0.9), m(0.3), 0x5a6068);
  });
  fillRect(r, m(2.5), m(0.78), m(0.7), m(0.12), 0xf8f0b0);
  return r;
}

/** A classical column: a fluted marble shaft on its base under a capital, whole or broken off. */
function column(height: number, broken: boolean): Raster {
  const r = canvas(1.8, height);
  footShadow(r, 1.7);
  const next = sequence(71 + height);
  ink(r, (l) => {
    fillRect(l, m(0.05), r.height - m(0.45), m(1.7), m(0.4), 0xd8d0c0);
    if (broken) {
      const points = [] as [number, number][];
      for (let x = 0; x <= 6; x++) points.push([m(0.25) + (x / 6) * m(1.3), m(0.1) + next() * m(0.6)]);
      fillPolygon(l, [...points, [m(1.55), r.height - m(0.4)], [m(0.25), r.height - m(0.4)]], 0xe8e0d0);
    } else {
      fillRect(l, m(0.25), m(0.7), m(1.3), r.height - m(1.1), 0xe8e0d0);
      fillRect(l, 0, m(0.1), m(1.8), m(0.35), 0xd8d0c0);
      fillRect(l, m(0.15), m(0.45), m(1.5), m(0.3), 0xe0d8c8);
    }
  });
  for (let x = m(0.4); x < m(1.5); x += m(0.25)) fillRect(r, x, m(0.9), 2, r.height - m(1.4), 0xc0b8a8);
  fillRect(r, m(1.25), m(0.9), m(0.3), r.height - m(1.4), 0xb8b0a0);
  return r;
}

/** A ruined arch: two weathered piers and the half of the arch that still stands. */
function ruinArch(): Raster {
  const r = canvas(10, 9);
  footShadow(r, 9);
  ink(r, (l) => {
    fillRect(l, m(0.4), m(2.5), m(2), r.height - m(2.6), 0xc8b090);
    fillRect(l, m(7.6), m(4.5), m(2), r.height - m(4.6), 0xc8b090);
    fillPolygon(
      l,
      [
        [m(0.4), m(2.5)],
        [m(1.6), m(0.6)],
        [m(4.4), m(0.3)],
        [m(5.6), m(0.9)],
        [m(5.2), m(2.2)],
        [m(4.0), m(1.9)],
        [m(2.4), m(3.4)],
        [m(2.4), m(4.5)],
      ],
      0xc8b090,
    );
  });
  for (let y = m(3); y < r.height - m(0.3); y += m(0.7)) {
    fillRect(r, m(0.4), y, m(2), 2, 0xa08a6a);
    if (y > m(4.8)) fillRect(r, m(7.6), y, m(2), 2, 0xa08a6a);
  }
  fillRect(r, m(1.9), m(2.6), m(0.5), r.height - m(2.8), 0xa89070);
  fillRect(r, m(9.1), m(4.6), m(0.5), r.height - m(4.8), 0xa89070);
  return r;
}

/** A temple front on the hill: a pediment over a row of columns, part of the roof fallen. */
function templeFront(): Raster {
  const r = canvas(18, 10);
  ink(r, (l) => {
    fillRect(l, 0, r.height - m(1), r.width, m(1), 0xd0c8b8);
    fillPolygon(
      l,
      [
        [m(0.4), m(2.6)],
        [m(7), m(0.4)],
        [m(10), m(1.4)],
        [m(11), m(2.6)],
      ],
      0xe0d8c8,
    );
    fillRect(l, m(0.4), m(2.6), m(13), m(1), 0xd8d0c0);
    for (let x = 0.8; x < 17; x += 2.1) {
      const top = x > 13 ? 4.6 + ((x * 7) % 3) : 3.6;
      fillRect(l, m(x), m(top), m(1.1), r.height - m(1) - m(top), 0xe8e0d0);
    }
  });
  for (let x = 0.8; x < 17; x += 2.1) fillRect(r, m(x + 0.8), m(4), m(0.3), r.height - m(5.1), 0xc0b8a8);
  return r;
}

/** A tall modern street lamp: a slim mast and a long curved arm. */
function streetLamp(): Raster {
  const r = canvas(2.6, 9);
  ink(r, (l) => {
    fillRect(l, m(0.3), m(0.8), m(0.22), r.height - m(0.8), 0x3a3e48);
    line(l, [m(0.4), m(0.9)], [m(1.4), m(0.4)], m(0.16), 0x3a3e48);
    fillRect(l, m(1.3), m(0.3), m(1.2), m(0.28), 0x3a3e48);
  });
  fillRect(r, m(1.35), m(0.55), m(1.1), m(0.1), 0xf8f0c8);
  return r;
}

/** A skyscraper: a glass or stone tower of window bands, its crown and antenna. */
function skyscraper(face: Color, glass: Color, light: Color, seed: number): Raster {
  const r = canvas(14, 40);
  const next = sequence(seed);
  ink(r, (l) => {
    fillRect(l, m(0.3), m(4), m(13.4), r.height - m(4.1), face);
    fillRect(l, m(2.5), m(2), m(9), m(2.1), face);
    fillRect(l, m(6.8), 0, m(0.3), m(2.1), 0x8a8a90);
  });
  for (let y = m(5); y < r.height - m(3); y += m(1.6))
    for (let x = m(1); x < m(13); x += m(1.4)) fillRect(r, x, y, m(1.0), m(1.0), next() < 0.12 ? light : glass);
  fillRect(r, m(11.6), m(4), m(2.1), r.height - m(4.1), (face & 0xfefefe) >> 1);
  fillRect(r, m(5), r.height - m(2.6), m(4), m(2.5), 0x2a2e38);
  return r;
}

/** Row 5's sprites. */
export const ROW5_SPRITES: Readonly<Record<string, () => Raster>> = {
  spectators,
  hotel,
  yacht,
  overpass,
  'sign-gantry': signGantry,
  'lamp-highway': highwayLamp,
  column: () => column(8, false),
  'column-broken': () => column(4.5, true),
  'ruin-arch': ruinArch,
  'temple-front': templeFront,
  'lamp-street': streetLamp,
  'skyscraper-glass': () => skyscraper(0x5a7898, 0x2a4868, 0xf0e8a0, 81),
  'skyscraper-stone': () => skyscraper(0xb8a890, 0x3a3a48, 0xf0d890, 83),
};

/** The seafront: a bright Riviera sky over the sea, a headland and its white town on the horizon. */
function seafrontSky(): Raster {
  const r = skyOf([0x1858c8, 0x2264d0, 0x2e72d8, 0x3a80e0, 0x4890e6, 0x58a0ec, 0x6cb0f0, 0x84c0f4], {
    light: 0xfcfcff,
    shade: 0xd0dcf0,
    count: 5,
    seed: 161,
  });
  const next = sequence(163);
  fillPolygon(
    r,
    [
      [700, HORIZON + 1],
      [820, HORIZON - 40],
      [980, HORIZON - 52],
      [1120, HORIZON - 30],
      [1260, HORIZON + 1],
    ],
    0x5a7a58,
  );
  for (let x = 830; x < 1170; x += 10 + next() * 8) {
    const h = 6 + next() * 10;
    fillRect(r, x, HORIZON - 30 - next() * 14 - h, 8, h, next() < 0.7 ? 0xf4f0e8 : 0xe8b090);
  }
  bands(r, HORIZON, SKY_HEIGHT, [0x1c5aa8, 0x1a54a0, 0x184c98, 0x164490]);
  for (let k = 0; k < 50; k++) fillRect(r, next() * SKY_WIDTH, HORIZON + 3 + next() * 50, 8 + next() * 30, 1, 0x70a8e4);
  return r;
}

/** The city at dusk: an orange-to-violet sky over a skyline of towers with lit windows. */
function citySky(): Raster {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, HORIZON, [0x2a2050, 0x3a2860, 0x52306a, 0x6e3a6c, 0x904868, 0xb05a60, 0xd07458, 0xe89458, 0xf4b468]);
  const next = sequence(171);
  for (let k = 0; k < 4; k++)
    cloud(r, 100 + k * 380 + next() * 80, 200 + next() * 50, 90 + next() * 50, 172 + k, 0xc87a8a, 0x8a4a6a, 0x5a3060);
  for (const [far, color, lit, rise] of [
    [true, 0x4a3a5a, 0xc89a78, 120],
    [false, 0x241c30, 0xf8d878, 80],
  ] as const)
    for (let x = -10; x < SKY_WIDTH;) {
      const w = 24 + next() * 50,
        h = (far ? 40 : 20) + next() * rise;
      fillRect(r, x, HORIZON - h, w, h + 2, color);
      if (next() < 0.25) fillRect(r, x + w / 2 - 1, HORIZON - h - 14, 2, 14, color);
      for (let y = HORIZON - h + 6; y < HORIZON - 4; y += 6)
        for (let wx = x + 4; wx < x + w - 4; wx += 6) if (next() < (far ? 0.2 : 0.35)) fillRect(r, wx, y, 3, 3, lit);
      x += w + (far ? next() * 12 : 4 + next() * 30);
    }
  bands(r, HORIZON, SKY_HEIGHT, [0x2a2830, 0x26242c, 0x222028]);
  return r;
}

/** Row 5's skies. */
export const ROW5_SKIES: Readonly<Record<string, () => Raster>> = {
  'sky-seafront': seafrontSky,
  'sky-city': citySky,
};
