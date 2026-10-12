import {
  bands,
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  line,
  sequence,
  type Color,
  type Raster,
} from './raster.js';
import { canvas, cloud, footShadow, HORIZON, ink, m, SKY_HEIGHT, SKY_WIDTH } from './kit.js';
import { hills, skyOf } from './row2.js';

/** A red barn with a gambrel roof, white trim and a hay door. */
function barn(): Raster {
  const r = canvas(12, 10);
  footShadow(r, 11.5);
  const w = r.width;
  ink(r, (l) => {
    fillRect(l, m(0.6), m(4.2), w - m(1.2), r.height - m(4.3), 0xb02a24);
    fillPolygon(
      l,
      [
        [m(0.2), m(4.4)],
        [m(2.0), m(1.6)],
        [w / 2, m(0.4)],
        [w - m(2.0), m(1.6)],
        [w - m(0.2), m(4.4)],
      ],
      0x5a4a48,
    );
  });
  fillPolygon(
    r,
    [
      [w / 2, m(0.5)],
      [w - m(2.0), m(1.6)],
      [w - m(0.3), m(4.3)],
      [w / 2, m(4.3)],
    ],
    0x463a3a,
  );
  for (let x = m(1.2); x < w - m(0.8); x += m(0.6)) fillRect(r, x, m(4.4), 2, r.height - m(4.6), 0x8a1e1a);
  ink(r, (l) => {
    fillRect(l, w / 2 - m(1.6), r.height - m(4.0), m(3.2), m(3.9), 0x8a1e1a);
    fillRect(l, w / 2 - m(0.8), m(2.2), m(1.6), m(1.4), 0x3a2a20);
  });
  line(r, [w / 2 - m(1.6), r.height - m(4.0)], [w / 2 + m(1.6), r.height - m(0.1)], 4, 0xf0e8e0);
  line(r, [w / 2 + m(1.6), r.height - m(4.0)], [w / 2 - m(1.6), r.height - m(0.1)], 4, 0xf0e8e0);
  fillRect(r, w / 2 - m(1.6), r.height - m(4.0), m(3.2), 4, 0xf0e8e0);
  return r;
}

/** A farm windmill: a lattice tower carrying a many-bladed wheel and its tail vane. */
function windmill(): Raster {
  const r = canvas(6, 14);
  const cx = r.width / 2,
    hub = m(2.6);
  ink(r, (l) => {
    line(l, [cx - m(1.8), r.height], [cx - m(0.3), hub], m(0.18), 0x8a8a90);
    line(l, [cx + m(1.8), r.height], [cx + m(0.3), hub], m(0.18), 0x8a8a90);
    for (let y = hub + m(2); y < r.height; y += m(2)) {
      const half = m(0.3) + ((y - hub) / (r.height - hub)) * m(1.5);
      line(l, [cx - half, y], [cx + half, y], m(0.1), 0x8a8a90);
    }
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      fillPolygon(
        l,
        [
          [cx, hub],
          [cx + Math.cos(a) * m(2.6), hub + Math.sin(a) * m(2.6)],
          [cx + Math.cos(a + 0.22) * m(2.6), hub + Math.sin(a + 0.22) * m(2.6)],
        ],
        k % 2 ? 0xd8d8e0 : 0xb8bcc8,
      );
    }
    fillEllipse(l, cx, hub, m(0.35), m(0.35), 0x606068);
  });
  return r;
}

/** A grain silo: a tall cylinder banded in steel with a domed cap. */
function silo(): Raster {
  const r = canvas(5, 15);
  footShadow(r, 4.5);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - m(2), m(2), m(4), r.height - m(2.1), 0xc8ccd4);
    fillEllipse(l, cx, m(2), m(2), m(1.4), 0xb0b4c0);
  });
  fillRect(r, cx + m(0.8), m(2), m(1.2), r.height - m(2.1), 0x9ca0ac);
  for (let y = m(3); y < r.height; y += m(1.4)) fillRect(r, cx - m(2), y, m(4), 3, 0x8a8e98);
  return r;
}

/** A round hay bale. */
function hayBale(): Raster {
  const r = canvas(2.2, 1.8);
  footShadow(r, 2);
  ink(r, (l) => fillEllipse(l, r.width / 2, r.height / 2 + 2, m(1.0), m(0.82), 0xd8b050));
  fillEllipse(r, r.width / 2 - m(0.2), r.height / 2, m(0.55), m(0.45), 0xe8c868);
  for (let k = 0; k < 4; k++)
    fillEllipse(
      r,
      r.width / 2 - m(0.2),
      r.height / 2,
      m(0.15 * k + 0.1),
      m(0.12 * k + 0.08),
      k % 2 ? 0xc89c40 : 0xe8c868,
    );
  return r;
}

/** A scarecrow in a straw hat. */
function scarecrow(): Raster {
  const r = canvas(2.2, 2.6);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - 3, m(0.6), 6, r.height - m(0.6), 0x7a5a32);
    fillRect(l, m(0.1), m(1.0), r.width - m(0.2), 6, 0x7a5a32);
    fillRect(l, cx - m(0.35), m(0.9), m(0.7), m(0.9), 0x3a6aa8);
    fillEllipse(l, cx, m(0.6), m(0.24), m(0.24), 0xe8d8a0);
    fillRect(l, cx - m(0.45), m(0.3), m(0.9), m(0.12), 0xd8b050);
    fillRect(l, cx - m(0.22), m(0.1), m(0.44), m(0.22), 0xd8b050);
  });
  return r;
}

/** A town house: a gabled facade of `color`, rows of windows, a door. */
function townHouse(color: Color, roof: Color, floors: number): Raster {
  const height = 3 * floors + 3;
  const r = canvas(8, height);
  const w = r.width;
  ink(r, (l) => {
    fillRect(l, m(0.3), m(2.6), w - m(0.6), r.height - m(2.7), color);
    fillPolygon(
      l,
      [
        [m(0.1), m(2.7)],
        [w / 2, m(0.2)],
        [w - m(0.1), m(2.7)],
      ],
      roof,
    );
  });
  for (let f = 0; f < floors; f++)
    for (const x of [1.2, 3.4, 5.6]) {
      const y = m(3.3 + f * 3);
      if (f === floors - 1 && x === 3.4) continue;
      fillRect(r, m(x), y, m(1.2), m(1.6), 0x2a3448);
      fillRect(r, m(x), y, m(1.2), m(0.25), 0xf0f0f0);
      fillRect(r, m(x) + m(0.55), y, 3, m(1.6), 0x5a6a88);
    }
  fillRect(r, w / 2 - m(0.7), r.height - m(2.3), m(1.4), m(2.2), 0x5a3a28);
  fillRect(r, w - m(1.2), m(2.6), m(0.9), r.height - m(2.7), (color & 0xfefefe) >> 1);
  return r;
}

/** A church tower: a stone shaft with a clock and a pointed spire. */
function churchTower(): Raster {
  const r = canvas(6, 26);
  footShadow(r, 5.5);
  const cx = r.width / 2;
  ink(r, (l) => {
    fillRect(l, cx - m(2.2), m(9), m(4.4), r.height - m(9.1), 0xc8b898);
    fillPolygon(
      l,
      [
        [cx - m(2.6), m(9.2)],
        [cx, m(0.2)],
        [cx + m(2.6), m(9.2)],
      ],
      0x4a5a78,
    );
    fillEllipse(l, cx, m(11.5), m(1.1), m(1.1), 0xf0f0e8);
  });
  fillRect(r, cx + m(0.9), m(9), m(1.3), r.height - m(9.1), 0xa89878);
  fillPolygon(
    r,
    [
      [cx, m(0.4)],
      [cx + m(2.5), m(9.1)],
      [cx + m(0.6), m(9.1)],
    ],
    0x3a4860,
  );
  line(r, [cx, m(11.5)], [cx, m(10.7)], 3, 0x202020);
  line(r, [cx, m(11.5)], [cx + m(0.6), m(11.5)], 3, 0x202020);
  for (const y of [14, 18])
    ink(r, (l) => {
      fillEllipse(l, cx, m(y), m(0.6), m(0.6), 0x2a2430);
      fillRect(l, cx - m(0.6), m(y), m(1.2), m(1.4), 0x2a2430);
    });
  return r;
}

/** A tunnel portal: a rock face around a concrete arch, its opening transparent over the road. */
function tunnelPortal(): Raster {
  const r = canvas(34, 18);
  const cx = r.width / 2,
    half = m(6.4),
    springing = r.height - m(4.5),
    crown = r.height - m(8.2);
  const next = sequence(5);
  ink(r, (l) => {
    const top: [number, number][] = [];
    for (let i = 0; i <= 12; i++) top.push([(i / 12) * r.width, m(1 + 3 * next()) + (Math.abs(i - 6) / 6) * m(4)]);
    fillPolygon(l, [...top, [r.width, r.height], [0, r.height]], 0x7a6a5a);
  });
  const opening = (x: number) => springing - (springing - crown) * Math.sqrt(Math.max(0, 1 - ((x - cx) / half) ** 2));
  for (let x = Math.floor(cx - half - m(1.2)); x < cx + half + m(1.2); x++) {
    const ring =
      springing - (springing - crown + m(1.2)) * Math.sqrt(Math.max(0, 1 - ((x - cx) / (half + m(1.2))) ** 2));
    fillRect(r, x, ring, 1, r.height - ring, 0xb8b4ac);
  }
  for (let x = Math.floor(cx - half); x < cx + half; x++)
    for (let y = Math.ceil(opening(x + 0.5)); y < r.height; y++) r.pixels[y * r.width + x] = 0;
  for (let k = 0; k < 14; k++) fillEllipse(r, next() * r.width, m(3) + next() * m(8), m(1.2), m(0.6), 0x5e5044, true);
  for (let k = 0; k < 6; k++) fillEllipse(r, next() * r.width, m(1.5) + next() * m(3), m(1.0), m(0.5), 0x3a6a34, true);
  return r;
}

/** A tunnel's interior rib: a dark concrete arch with lamps, its opening transparent over the road. */
function tunnelRib(): Raster {
  const r = canvas(15, 8);
  const cx = r.width / 2,
    half = m(6.4),
    springing = r.height - m(4.5),
    crown = r.height - m(7.4);
  const opening = (x: number) => springing - (springing - crown) * Math.sqrt(Math.max(0, 1 - ((x - cx) / half) ** 2));
  fillRect(r, 0, 0, r.width, r.height, 0x3a3634);
  for (let x = Math.floor(cx - half); x < cx + half; x++)
    for (let y = Math.ceil(opening(x + 0.5)); y < r.height; y++) r.pixels[y * r.width + x] = 0;
  for (let x = Math.floor(cx - half - m(0.4)); x < cx + half + m(0.4); x++) {
    const y = opening(Math.min(cx + half - 1, Math.max(cx - half, x)));
    fillRect(r, x, y - m(0.4), 1, m(0.4), 0x5a5652);
  }
  for (const dx of [-3.5, 0, 3.5])
    fillRect(r, cx + m(dx) - m(0.5), opening(cx + m(dx)) - m(0.3), m(1), m(0.2), 0xf8e8a0);
  return r;
}

/** A pine: tiers of dark green over a short trunk. */
export function pine(height: number, seed: number): Raster {
  const r = canvas(height * 0.45, height);
  footShadow(r, height * 0.3);
  const cx = r.width / 2;
  const next = sequence(seed);
  ink(r, (l) => {
    fillRect(l, cx - m(0.2), r.height - m(2.4), m(0.4), m(2.3), 0x6a4a2a);
    for (let k = 0; k < 5; k++) {
      const top = m(0.1) + (k * (r.height - m(1.6))) / 6,
        bottom = top + (r.height - m(1.6)) / 3.2,
        half = (r.width / 2) * (0.35 + 0.65 * ((k + 1) / 5)) * (0.9 + 0.1 * next());
      fillPolygon(
        l,
        [
          [cx, top],
          [cx + half, bottom],
          [cx - half, bottom],
        ],
        0x245a34,
      );
    }
  });
  for (let k = 0; k < 5; k++) {
    const top = m(0.1) + (k * (r.height - m(1.6))) / 6,
      bottom = top + (r.height - m(1.6)) / 3.2,
      half = (r.width / 2) * (0.35 + 0.65 * ((k + 1) / 5));
    fillPolygon(
      r,
      [
        [cx, top + 4],
        [cx + half - 4, bottom - 2],
        [cx + 2, bottom - 2],
      ],
      0x183e24,
    );
    fillPolygon(
      r,
      [
        [cx - 2, top + 8],
        [cx - half * 0.5, bottom - 6],
        [cx - half * 0.3, bottom - 4],
      ],
      0x3a7a44,
    );
  }
  return r;
}

/** Row 3's sprites. */
export const ROW3_SPRITES: Readonly<Record<string, () => Raster>> = {
  barn,
  windmill,
  silo,
  'hay-bale': hayBale,
  scarecrow,
  'house-ochre': () => townHouse(0xd8a860, 0xa84a30, 3),
  'house-rose': () => townHouse(0xd88a88, 0x7a3a38, 2),
  'house-blue': () => townHouse(0x8ab0d0, 0x4a4a58, 3),
  'church-tower': churchTower,
  'tunnel-portal': tunnelPortal,
  'tunnel-rib': tunnelRib,
  pine: () => pine(12, 3),
};

/** A range of mountains along the horizon, snow on the peaks. */
function mountains(r: Raster, base: Color, shade: Color, snow: Color, height: number, seed: number) {
  const next = sequence(seed);
  const peaks: [number, number][] = [];
  for (let x = -60; x < SKY_WIDTH + 120; x += 70 + next() * 90)
    peaks.push([x, HORIZON - height * (0.45 + 0.55 * next())]);
  for (let i = 0; i + 1 < peaks.length; i++) {
    const [x0, y0] = peaks[i]!,
      [x1, y1] = peaks[i + 1]!,
      mx = (x0 + x1) / 2,
      my = Math.max(y0, y1) + 30 + next() * 30;
    fillPolygon(
      r,
      [
        [x0, y0],
        [mx, my],
        [x1, y1],
        [x1, HORIZON + 2],
        [x0, HORIZON + 2],
      ],
      base,
    );
    fillPolygon(
      r,
      [
        [x0, y0],
        [mx, my],
        [mx, HORIZON + 2],
        [x0 + 10, HORIZON + 2],
      ],
      shade,
    );
    fillPolygon(
      r,
      [
        [x0, y0],
        [x0 + 18, y0 + 22],
        [x0 - 18, y0 + 22],
      ],
      snow,
    );
  }
}

/** The mountains: a deep blue sky over a snowy range and green foothills. */
function mountainSky(): Raster {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, HORIZON, [0x1848a8, 0x2054b0, 0x2a60b8, 0x346cc0, 0x4078c6, 0x4e86cc, 0x5e94d0, 0x70a2d4]);
  const next = sequence(91);
  for (let k = 0; k < 5; k++)
    cloud(r, 50 + k * 300 + next() * 80, 200 + next() * 40, 90 + next() * 60, 91 + k, 0xf8f8ff, 0xc8d4ec);
  mountains(r, 0x6a7a98, 0x56647e, 0xf0f4f8, 110, 5);
  mountains(r, 0x3a6a44, 0x2e563a, 0x3a6a44, 40, 9);
  bands(r, HORIZON, SKY_HEIGHT, [0x2e563a, 0x2a5236]);
  return r;
}

/** A tunnel's interior: dark concrete above and below, a row of lamps along the ceiling line. */
function tunnelSky(): Raster {
  const r = createRaster(SKY_WIDTH, SKY_HEIGHT);
  bands(r, 0, SKY_HEIGHT, [0x1a1816, 0x22201e, 0x2a2826, 0x22201e, 0x1a1816]);
  for (let x = 0; x < SKY_WIDTH; x += 47) fillRect(r, x, HORIZON - 70, 22, 5, 0xc8b878);
  return r;
}

/** Farm country: a warm summer sky over golden and green fields rolling to the horizon. */
function farmSky(): Raster {
  const r = skyOf([0x3c80d8, 0x4a8cdc, 0x5a98e0, 0x6aa4e4, 0x7cb0e6, 0x90bce6, 0xa6c8e4, 0xbed4e0], {
    light: 0xfffcf0,
    shade: 0xe0dcd0,
    count: 5,
    seed: 101,
  });
  hills(r, [
    { color: 0xc8b060, rim: 0xd8c478, height: 34, seed: 13 },
    { color: 0x7aa048, rim: 0x90b458, height: 18, seed: 17 },
  ]);
  bands(r, HORIZON, SKY_HEIGHT, [0x7aa048, 0x749a44]);
  return r;
}

/** The old town: a pale sky over a skyline of roofs, chimneys and a dome. */
function townSky(): Raster {
  const r = skyOf([0x5a88c0, 0x6692c4, 0x729cc8, 0x80a6cc, 0x8eb0ce, 0x9cbad0, 0xaac2d0, 0xb8cad0], {
    light: 0xf8f4f0,
    shade: 0xd4ccc8,
    count: 4,
    seed: 111,
  });
  const next = sequence(21);
  for (let x = 0; x < SKY_WIDTH;) {
    const w = 40 + next() * 60,
      h = 30 + next() * 50;
    const color = [0xa86a50, 0x9a5a48, 0xb87a5a][Math.floor(next() * 3)]!;
    fillRect(r, x, HORIZON - h, w, h + 4, 0xb8a890);
    fillPolygon(
      r,
      [
        [x - 3, HORIZON - h],
        [x + w / 2, HORIZON - h - 22],
        [x + w + 3, HORIZON - h],
      ],
      color,
    );
    if (next() < 0.4) fillRect(r, x + w * 0.7, HORIZON - h - 26, 6, 18, 0x8a7a68);
    x += w + next() * 8;
  }
  fillEllipse(r, 900, HORIZON - 110, 46, 40, 0x6a8a98);
  fillRect(r, 854, HORIZON - 110, 92, 110, 0xc8b898);
  bands(r, HORIZON, SKY_HEIGHT, [0x8a7a68, 0x847462]);
  return r;
}

/** Row 3's skies. */
export const ROW3_SKIES: Readonly<Record<string, () => Raster>> = {
  'sky-farm': farmSky,
  'sky-town': townSky,
  'sky-mountain': mountainSky,
  'sky-tunnel': tunnelSky,
};
