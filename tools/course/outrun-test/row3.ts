import { hex, random, type Color, type StageContext, type Surfaces } from './context.js';
import { WET } from './row2.js';

/**
 * A low-grip patch across the road from `start` to `end`: `material` with `color`, darker blotches every few metres so
 * it reads from afar.
 */
export function patch(ctx: StageContext, start: number, end: number, material: string, color: Color, blotch: Color) {
  const { roadLeft, roadRight } = ctx;
  ctx.strip(start, end, roadLeft(-0.3), roadRight(-0.3), color, material);
  ctx.bands(start + 2, end - 2, roadLeft(-1.0), roadRight(-1.2), blotch, 7, 2);
}

/** DIRT on the road: brown, darker blotches. */
export const DIRT = { color: hex(0x8a6c44), blotch: hex(0x6e5434) };

/** FARMLAND's ground: grass verges, fields beyond. */
export const FARMLAND_SURFACES: Partial<Surfaces> = {
  ground: [hex(0xc8b05c), hex(0xd0b868)],
  verge: { width: 4, material: 'GRASS', colors: [hex(0x5a9a38), hex(0x66a640)] },
  rumble: [hex(0xe8e8e8), hex(0x8a8a8a)],
};

/**
 * FARMLAND: a roller-coaster road through fields of wheat, green crops and ploughed earth behind wooden fences, its
 * blind crests lifting the car; barns, silos and windmills, hay bales and scarecrows; dirt washed across the road at
 * crests and landings.
 */
export function farmland(ctx: StageContext, crests: readonly number[]) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(301);
  // Fields beyond the fences, changing crop every few hundred metres on each side.
  const crops: readonly [Color, Color][] = [
    [hex(0xd8c060), hex(0xc8b050)],
    [hex(0x6aa040), hex(0x5a9038)],
    [hex(0x8a6a48), hex(0x7a5a3c)],
  ];
  for (const side of ['left', 'right'] as const)
    for (let s = 0, k = side === 'left' ? 0 : 1; s < length; k++) {
      const end = Math.min(length, s + 280 + next() * 260);
      const [a, b] = crops[k % 3]!;
      const [l, r] = side === 'left' ? [null, roadLeft(4)] : [roadRight(4), null];
      ctx.strip(s, end, l, r, a);
      ctx.bands(s, end, l, r, b, 6, 2);
      s = end;
    }
  // Wooden fences along both verges, for looks.
  for (const [id, lateral] of [
    ['fence-left', roadLeft(3.6)],
    ['fence-right', roadRight(3.6)],
  ] as const) {
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
    ctx.wall(
      id,
      60,
      ctx.final - 40,
      [
        { color: hex(0xa07848), bottom: 0.5, top: 0.65 },
        { color: hex(0xa07848), bottom: 0.95, top: 1.1 },
        { color: hex(0x7a5634), bottom: 0, top: 1.25, every: 3, part: 0.18 },
      ],
      null,
    );
  }
  // Farmsteads, hay and scarecrows in the fields.
  for (let s = 400, k = 0; s < length - 300; s += 650 + next() * 300, k++) {
    const side = k % 2 ? roadRight : roadLeft;
    ctx.sprite('barn', s, side(28));
    ctx.sprite('silo', s + 14, side(38));
    if (k % 2 === 0) ctx.sprite('windmill', s - 40, side(18));
  }
  for (let s = 100; s < length; s += 40 + next() * 70)
    ctx.sprite('hay-bale', s, next() < 0.5 ? roadLeft(8 + next() * 30) : roadRight(8 + next() * 30));
  for (let s = 300; s < length; s += 500 + next() * 300) ctx.sprite('scarecrow', s, roadRight(6));
  for (let s = 200; s < length; s += 160 + next() * 200) ctx.sprite('tree-round-lime', s, roadLeft(12 + next() * 10));
  // Dirt over each crest and on the landing after it.
  for (const crest of crests) {
    patch(ctx, crest - 30, crest + 20, 'DIRT', DIRT.color, DIRT.blotch);
    patch(ctx, crest + 120, crest + 180, 'DIRT', DIRT.color, DIRT.blotch);
  }
}

/** OLD TOWN's ground: stone pavements, cobble-grey streets. */
export const OLD_TOWN_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x8a7a68), hex(0x847462)],
  verge: { width: 2.2, material: 'SHOULDER', colors: [hex(0xb0a898), hex(0xa8a090)] },
  road: [hex(0x6a6460), hex(0x726c66)],
  rumble: null,
};

/** A run of house fronts along a Boundary: blocks of plaster colors, rows of windows, a cornice and a roof line. */
function facades(ctx: StageContext, boundary: string, start: number, end: number, seed: number) {
  const next = random(seed);
  const plaster = [hex(0xd8b878), hex(0xd89890), hex(0xa8c0d0), hex(0xe0d4b8), hex(0xc8a080), hex(0xb8c8a0)];
  for (let s = start; s < end - 10;) {
    const block = Math.min(end - s, 22 + next() * 26),
      height = 8 + Math.floor(next() * 3) * 2.5;
    const color = plaster[Math.floor(next() * plaster.length)]!;
    ctx.wall(
      boundary,
      s,
      s + block,
      [
        { color, bottom: 0, top: height },
        { color: hex(0x6a4a3a), bottom: 0, top: 2.4, every: 7, part: 1.4 },
        ...Array.from({ length: Math.floor((height - 3) / 2.5) }, (_, k) => ({
          color: hex(0x2a3448),
          bottom: 3.4 + k * 2.5,
          top: 4.8 + k * 2.5,
          every: 3.2,
          part: 1.2,
        })),
        { color: hex(0xe8e0d0), bottom: height - 0.6, top: height - 0.35 },
        { color: hex(0xa04a30), bottom: height - 0.35, top: height },
      ],
      {},
    );
    s += block;
  }
}

/**
 * OLD TOWN: narrow streets between continuous house fronts, near-right-angle corners, the street narrowing to one lane
 * through the middle of town, lamps on the pavements, a church tower above the roofs, and one wet stretch of cobbles.
 */
export function oldTown(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  for (const [id, lateral] of [
    ['fronts-left', roadLeft(2.2)],
    ['fronts-right', roadRight(2.2)],
  ] as const)
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
  facades(ctx, 'fronts-left', 150, ctx.final + 120, 302);
  facades(ctx, 'fronts-right', 150, ctx.final + 120, 303);
  ctx.sprites('lamp-classic', 160, ctx.final, 26, roadLeft(1.0));
  ctx.sprites('lamp-classic', 173, ctx.final, 26, roadRight(1.0));
  ctx.sprite('church-tower', 1500, roadRight(24));
  ctx.sprite('church-tower', 3000, roadLeft(30));
  // The wet cobbles through the middle of town, under an overcast sky.
  const corners = ctx.arcs.filter((a) => a.start > 1200 && a.start < ctx.final - 400);
  const corner = corners[Math.floor(corners.length / 2)];
  if (corner) {
    ctx.strip(corner.start - 220, corner.end + 60, roadLeft(), roadRight(), hex(0x4a4448), 'WET_ASPHALT');
    ctx.bands(corner.start - 216, corner.end + 56, roadLeft(-0.4), roadRight(-0.4), hex(0x8a8aa0), 5, 0.8);
    ctx.environment(corner.start - 360, 'RAIN', 'sky-overcast', 'wipe');
    ctx.environment(corner.end + 160, 'CLEAR', 'sky-town', 'wipe');
  }
}

/** TUNNEL RUN's ground: narrow shoulders, mountain grass. */
export const TUNNEL_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x4a7a3c), hex(0x527e40)],
  verge: { width: 1.6, material: 'SHOULDER', colors: [hex(0x8a8a80), hex(0x929288)] },
  rumble: [hex(0xf0d020), hex(0x303030)],
};

/**
 * TUNNEL RUN: a mountain road through seven short tunnels with daylight between them; inside, concrete walls and lit
 * ribs under a dark interior; outside, pines and rocks; each exit wet under an overcast sky for a stretch.
 */
export function tunnelRun(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(304);
  for (const [id, lateral] of [
    ['bore-left', roadLeft(1.6)],
    ['bore-right', roadRight(1.6)],
  ] as const)
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
  ctx.sprites('pine', 40, ctx.final, 34, roadLeft(5));
  ctx.sprites('pine', 57, ctx.final, 34, roadRight(5));
  for (let s = 100; s < length; s += 60 + next() * 90)
    ctx.sprite('pine', s, next() < 0.5 ? roadLeft(12 + next() * 20) : roadRight(12 + next() * 20));
  for (let s = 0, k = 0; k < 7; k++) {
    const start = 420 + s,
      bore = 170 + 50 * (k % 3);
    if (start + bore > ctx.final - 300) break;
    const end = start + bore;
    for (const id of ['bore-left', 'bore-right'])
      ctx.wall(
        id,
        start,
        end,
        [
          { color: hex(0xa8a49c), bottom: 0, top: 6.5 },
          { color: hex(0x5a5650), bottom: 0, top: 0.5 },
          { color: hex(0xe8d890), bottom: 3.6, top: 3.8, every: 10, part: 2 },
        ],
        {},
      );
    ctx.sprite('tunnel-portal', start, edge('a', 'right'));
    ctx.sprites('tunnel-rib', start + 10, end - 4, 10, edge('a', 'right'));
    ctx.strip(start, end, roadLeft(1.6), roadRight(1.6), hex(0x48443e));
    ctx.bands(start, end, roadLeft(), roadRight(), hex(0x5a5650), 10, 3);
    ctx.environment(start + 2, 'TUNNEL', 'sky-tunnel', 'cut');
    // The exit: wet road and an overcast sky, clearing after the stretch.
    ctx.environment(end, 'RAIN', 'sky-overcast', 'cut');
    ctx.strip(end, end + 110, roadLeft(), roadRight(), WET.color, 'WET_ASPHALT');
    ctx.bands(end + 3, end + 106, roadLeft(-0.4), roadRight(-0.4), WET.reflection, 16, 2.5);
    ctx.environment(end + 240, 'MOUNTAIN', 'sky-mountain', 'wipe');
    s += bore + 300 + 80 * (k % 2);
  }
}
