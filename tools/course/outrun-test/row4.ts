import { hex, random, type StageContext, type Surfaces } from './context.js';
import { chevrons, WET } from './row2.js';
import { DIRT, patch } from './row3.js';

/** LAKESIDE's ground: lawns by the lake. */
export const LAKESIDE_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x4a8a3a), hex(0x529240)],
  verge: { width: 5, material: 'GRASS', colors: [hex(0x5aa040), hex(0x66aa48)] },
};

const WATER = [hex(0x2e6aa8), hex(0x3a78b4)] as const;

/** A bridge from `start` to `end`: water both sides, a concrete deck over the verges, railings and steel towers. */
function bridge(ctx: StageContext, start: number, end: number) {
  const { roadLeft, roadRight, edge } = ctx;
  ctx.strip(start, end, roadRight(5), null, WATER[0]);
  ctx.bands(start, end, roadRight(5), null, WATER[1], 30, 10);
  ctx.strip(start, end, roadLeft(5), roadLeft(), hex(0xa8a8a0), 'SHOULDER');
  ctx.strip(start, end, roadRight(), roadRight(5), hex(0xa8a8a0), 'SHOULDER');
  for (const id of ['rail-left', 'rail-right'])
    ctx.wall(
      id,
      start,
      end,
      [
        { color: hex(0xd8dce4), bottom: 0.8, top: 1.05 },
        { color: hex(0x9098a4), bottom: 0, top: 1.05, every: 2.5, part: 0.2 },
        { color: hex(0x7a7e86), bottom: -6, top: 0 },
      ],
      { sound: 'guardrail', freeStart: 0.2, freeEnd: 0.2 },
    );
  ctx.sprite('bridge-tower', start + 4, edge('a', 'right'));
  ctx.sprite('bridge-tower', end - 4, edge('a', 'right'));
  ctx.sprites('lamp-classic', start + 20, end - 20, 30, roadLeft(4.2));
  ctx.sprites('lamp-classic', start + 35, end - 20, 30, roadRight(4.2));
}

/**
 * LAKESIDE: long fast sweepers along a lake on the left, willows, boathouses, reeds and sails; four bridges carry the
 * road over its inlets, water on both sides between railings and steel towers.
 */
export function lakeside(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(401);
  ctx.strip(0, length, null, roadLeft(5), WATER[0]);
  ctx.bands(0, length, null, roadLeft(5), WATER[1], 30, 10);
  ctx.strip(0, length, roadLeft(6), roadLeft(5), hex(0xc8b888));
  for (const [id, lateral] of [
    ['rail-left', roadLeft(4.6)],
    ['rail-right', roadRight(4.6)],
  ] as const)
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
  const bridges = [900, 2200, 3600, 5000].filter((s) => s + 260 < ctx.final - 100);
  for (const s of bridges) bridge(ctx, s, s + 220 + (s % 3) * 20);
  const onBridge = (s: number) => bridges.some((b) => s > b - 30 && s < b + 290);
  for (let s = 30; s < length; s += 28 + next() * 30)
    if (!onBridge(s)) ctx.sprite('willow', s, roadRight(8 + next() * 10));
  for (let s = 60; s < length; s += 40 + next() * 50) if (!onBridge(s)) ctx.sprite('reeds', s, roadLeft(6.5));
  for (let s = 300; s < length; s += 500 + next() * 400) if (!onBridge(s)) ctx.sprite('boathouse', s, roadLeft(9));
  for (let s = 150; s < length; s += 120 + next() * 160) ctx.sprite('sail', s, roadLeft(30 + next() * 120));
  for (let s = 100; s < length; s += 70 + next() * 90) ctx.sprite('tree-round', s, roadRight(22 + next() * 25));
}

/** DESERT's ground: gravel shoulders, sand to the horizon. */
export const DESERT_SURFACES: Partial<Surfaces> = {
  ground: [hex(0xd8b080), hex(0xd0a878)],
  verge: { width: 4, material: 'SHOULDER', colors: [hex(0xb89870), hex(0xc0a078)] },
  road: [hex(0x5a5a62), hex(0x62626a)],
  rumble: [hex(0xf0f0f0), hex(0x5a5a62)],
};

/**
 * DESERT: horizon-long undulating straights through sand, red mesas on the horizon and beside the road, saguaros, a
 * line of telephone poles, and sand drifted across the road from either side, deepest at the crests.
 */
export function desert(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(402);
  ctx.sprites('telephone-pole', 20, length - 20, 55, roadRight(7));
  for (let s = 40; s < length; s += 30 + next() * 70)
    ctx.sprite('saguaro', s, next() < 0.5 ? roadLeft(6 + next() * 40) : roadRight(10 + next() * 40));
  for (let s = 200; s < length; s += 700 + next() * 500)
    ctx.sprite('mesa', s, next() < 0.5 ? roadLeft(90 + next() * 90) : roadRight(90 + next() * 90));
  // Drifts: sand over one or two lanes from a side, every few hundred metres on the undulations and straights.
  for (let s = 500, k = 0; s < ctx.final - 300; s += 380 + next() * 300, k++) {
    const long = 30 + next() * 30;
    const [left, right] =
      k % 2
        ? [roadLeft(0.3), edge('a', 'right', 1.2 + next() * 2.5)]
        : [edge('a', 'right', -1.5 - next() * 2), roadRight(0.3)];
    ctx.strip(s, s + long, left, right, hex(0xe0c08c), 'SAND');
    ctx.bands(s + 2, s + long - 2, left, right, hex(0xc8a474), 6, 1.5);
  }
}

/** ALPINE PASS's ground: alpine meadow, narrow gravel shoulders. */
export const ALPINE_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x4a7a44), hex(0x527e48)],
  verge: { width: 2, material: 'SHOULDER', colors: [hex(0x8a8a82), hex(0x92928a)] },
  rumble: [hex(0xd02828), hex(0xf0f0f0)],
};

/**
 * ALPINE PASS: switchback hairpins up a steep grade, a rock face on the mountain side and the valley falling away on
 * the other behind snow poles; chalets and pines; the upper stretch over the summit wet under a dark storm sky.
 */
export function alpinePass(ctx: StageContext, summit: readonly [number, number]) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(403);
  ctx.strip(0, length, null, roadLeft(2), 'transparent');
  ctx.boundary('valley', [
    [0, roadLeft(2)],
    [length, roadLeft(2)],
  ]);
  ctx.wall(
    'valley',
    100,
    ctx.final - 60,
    [
      { color: hex(0x6a6e64), bottom: -70, top: 0 },
      { color: hex(0x4e5a48), bottom: -70, top: -1, every: 12, part: 4 },
    ],
    null,
  );
  ctx.boundary('mountain', [
    [0, roadRight(2)],
    [length, roadRight(2)],
  ]);
  ctx.wall(
    'mountain',
    120,
    ctx.final - 60,
    [
      { color: hex(0x7a7a80), bottom: 0, top: 10 },
      { color: hex(0x5e5e66), bottom: 3, top: 4 },
      { color: hex(0x9a9aa0), bottom: 7, top: 10, every: 11, part: 4 },
    ],
    { sound: 'rock' },
  );
  ctx.sprites('snow-pole', 30, ctx.final, 20, roadLeft(1.2));
  for (let s = 80; s < length; s += 60 + next() * 80)
    ctx.sprite('pine', s, roadRight(5 + next() * 8), { groundOffset: 10 });
  for (let s = 200; s < length; s += 120 + next() * 150)
    ctx.sprite('pine', s, roadLeft(30 + next() * 60), { groundOffset: -60 });
  for (let s = 600; s < length; s += 900 + next() * 400) ctx.sprite('chalet', s, roadRight(12), { groundOffset: 10 });
  chevrons(ctx, 60, { left: 1.4, right: 1.4 });
  // The wet heights over the summit, under the storm.
  const [from, to] = summit;
  ctx.strip(from, to, roadLeft(), roadRight(), WET.color, 'WET_ASPHALT');
  ctx.bands(from + 4, to - 4, roadLeft(-0.4), roadRight(-0.4), WET.reflection, 16, 2.5);
  ctx.environment(from - 250, 'STORM', 'sky-alpine-dark', 'rise');
  ctx.environment(to + 200, 'PASS', 'sky-mountain', 'rise');
}

/** FOREST's ground: dirt shoulders under the trees. */
export const FOREST_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x2a4a24), hex(0x30522a)],
  verge: { width: 2.4, material: 'DIRT', colors: [hex(0x7a5e3c), hex(0x846642)] },
  rumble: null,
};

/** FOREST: a narrow road of unbroken S-bends between dense trees, dirt shoulders, and dirt washed across some bends. */
export function forest(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(404);
  for (const [side, lateral] of [
    ['left', roadLeft],
    ['right', roadRight],
  ] as const) {
    for (let s = 10 + (side === 'left' ? 0 : 5); s < length; s += 7 + next() * 6)
      ctx.sprite(next() < 0.55 ? 'pine' : 'tree-dark', s, lateral(3.4 + next() * 2.5));
    for (let s = 20; s < length; s += 9 + next() * 8)
      ctx.sprite(next() < 0.5 ? 'pine' : 'tree-dark', s, lateral(8 + next() * 10));
  }
  ctx.strip(0, length, null, roadLeft(2.4), hex(0x1e3a1c));
  ctx.strip(0, length, roadRight(2.4), null, hex(0x1e3a1c));
  ctx.arcs.forEach((arc, k) => {
    if (k % 4 === 1 && arc.end < ctx.final - 200)
      patch(ctx, arc.start - 25, arc.start + 25, 'DIRT', DIRT.color, DIRT.blotch);
  });
}
