import { hex, random, type StageContext, type Surfaces } from './context.js';
import { chevrons, wetStretch } from './row2.js';
import { DIRT, patch } from './row3.js';

/** Spectators along both sides of a goal's finish straight, before and past its arch. */
function finishCrowd(ctx: StageContext, offset: number) {
  const finish = ctx.finish ?? ctx.length;
  ctx.sprites('spectators', finish - 160, finish + 40, 8, ctx.roadLeft(offset));
  ctx.sprites('spectators', finish - 156, finish + 40, 8, ctx.roadRight(offset));
}

/** RIVIERA's ground: a pale promenade along the road, the beach and the sea beyond. */
export const RIVIERA_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x3a8a3a), hex(0x429242)],
  verge: { width: 5, material: 'SHOULDER', colors: [hex(0xd8ccb0), hex(0xe0d4b8)] },
  rumble: [hex(0xf0f0f0), hex(0x2858c8)],
};

/**
 * RIVIERA: long fast sweepers along the seafront, the sea and the beach with parasols and yachts on the left, the
 * promenade's palms and lamps, white hotels on the right, and crowds along the finish.
 */
export function riviera(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(501);
  ctx.strip(0, length, null, roadLeft(14), hex(0x2a6ab0));
  ctx.bands(0, length, null, roadLeft(14), hex(0x3a7ac0), 30, 10);
  ctx.strip(0, length, roadLeft(14), roadLeft(5), hex(0xe8d8a8));
  ctx.sprites('palm-tall', 20, length, 30, roadLeft(3.4));
  ctx.sprites('palm-bent', 35, length, 30, roadRight(3.4));
  ctx.sprites('lamp-classic', 28, length, 30, roadLeft(1.4));
  ctx.sprites('lamp-classic', 43, length, 30, roadRight(1.4));
  for (let s = 60; s < length; s += 22 + next() * 30)
    ctx.sprite(next() < 0.5 ? 'parasol-red' : 'parasol-blue', s, roadLeft(7 + next() * 5));
  for (let s = 200; s < length; s += 140 + next() * 220) ctx.sprite('yacht', s, roadLeft(40 + next() * 90));
  for (let s = 80; s < length; s += 26 + next() * 18) ctx.sprite('hotel', s, roadRight(12 + next() * 6));
  finishCrowd(ctx, 4.6);
}

/** INTERCHANGE's ground: concrete hard shoulders, dry grass beyond the barriers. */
export const INTERCHANGE_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x7a8a4a), hex(0x82904e)],
  verge: { width: 3, material: 'SHOULDER', colors: [hex(0x9a9a94), hex(0xa2a29c)] },
  rumble: [hex(0xf0f0f0), hex(0x606068)],
};

/**
 * INTERCHANGE: a motorway whose lanes join and leave, between concrete barriers, highway lamps and direction gantries,
 * passing under overpasses.
 */
export function interchange(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(502);
  for (const [id, lateral] of [
    ['barrier-left', roadLeft(2.6)],
    ['barrier-right', roadRight(2.6)],
  ] as const) {
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
    ctx.wall(
      id,
      ctx.entryEnd,
      ctx.final - 40,
      [
        { color: hex(0xb8b4a8), bottom: 0, top: 0.9 },
        { color: hex(0x8a867c), bottom: 0, top: 0.2 },
      ],
      { sound: 'wall', freeStart: 0.2, freeEnd: 0.2 },
    );
  }
  ctx.sprites('lamp-highway', 30, length, 50, roadLeft(3.4));
  ctx.sprites('lamp-highway', 55, length, 50, roadRight(3.4));
  for (let s = 500; s < ctx.final - 200; s += 650 + next() * 300) ctx.sprite('overpass', s, edge('a', 'right'));
  for (let s = 850; s < ctx.final - 200; s += 1100 + next() * 300) ctx.sprite('sign-gantry', s, edge('a', 'right'));
  for (let s = 100; s < length; s += 60 + next() * 90)
    ctx.sprite('tree-round-lime', s, next() < 0.5 ? roadLeft(14 + next() * 30) : roadRight(14 + next() * 30));
  finishCrowd(ctx, 2.2);
}

/** DOWNHILL's ground: alpine meadow, gravel shoulders. */
export const DOWNHILL_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x5a8a44), hex(0x62924a)],
  verge: { width: 3, material: 'SHOULDER', colors: [hex(0x9a9282), hex(0xa29a8a)] },
};

/**
 * DOWNHILL: a long descent with big jumps on its straights, pines and rocks, and a ridge in the middle where the
 * ground falls away on both sides behind guardrails.
 */
export function downhill(ctx: StageContext, ridge: readonly [number, number]) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(503);
  const [from, to] = ridge;
  const onRidge = (s: number) => s > from - 40 && s < to + 40;
  for (let s = 40; s < length; s += 30 + next() * 40)
    if (!onRidge(s)) ctx.sprite('pine', s, next() < 0.5 ? roadLeft(5 + next() * 14) : roadRight(5 + next() * 14));
  for (let s = 150; s < length; s += 200 + next() * 200)
    if (!onRidge(s)) ctx.sprite('cliff-rock', s, next() < 0.5 ? roadLeft(8 + next() * 10) : roadRight(8 + next() * 10));
  // The ridge: transparent ground beyond both verges shows the valleys far below, rock faces falling from the edges.
  for (const [side, lateral] of [
    ['left', roadLeft(3)],
    ['right', roadRight(3)],
  ] as const) {
    ctx.strip(from, to, side === 'left' ? null : lateral, side === 'left' ? lateral : null, 'transparent');
    ctx.boundary(`ridge-${side}`, [
      [0, lateral],
      [length, lateral],
    ]);
    ctx.wall(
      `ridge-${side}`,
      from,
      to,
      [
        { color: hex(0x7a705e), bottom: -60, top: 0 },
        { color: hex(0x5e5648), bottom: -60, top: -1, every: 10, part: 3 },
      ],
      null,
    );
  }
  for (const [id, lateral] of [
    ['rail-left', roadLeft(1.4)],
    ['rail-right', roadRight(1.4)],
  ] as const) {
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
    ctx.wall(
      id,
      from - 30,
      to + 30,
      [
        { color: hex(0xc8ccd4), bottom: 0.45, top: 0.75 },
        { color: hex(0x9098a4), bottom: 0, top: 0.75, every: 4, part: 0.15 },
      ],
      { sound: 'guardrail', freeStart: 0.2, freeEnd: 0.2 },
    );
  }
  ctx.sprites('snow-pole', from, to, 25, roadLeft(1.0));
  ctx.sprites('snow-pole', from + 12, to, 25, roadRight(1.0));
  chevrons(ctx, 60, { left: 1.8, right: 1.8 });
  finishCrowd(ctx, 2.0);
}

/** RUINS' ground: dry grass and dirt shoulders. */
export const RUINS_SURFACES: Partial<Surfaces> = {
  ground: [hex(0xa89a5a), hex(0xb0a262)],
  verge: { width: 3, material: 'DIRT', colors: [hex(0xa8865a), hex(0xb08e62)] },
  rumble: null,
};

/**
 * RUINS: a winding road through an ancient site, columns standing and broken along both sides, ruined arches, a temple
 * on the hill and cypresses, with dirt across the road at the bends.
 */
export function ruins(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(504);
  for (const [side, lateral] of [
    ['left', roadLeft],
    ['right', roadRight],
  ] as const) {
    for (let s = 30 + (side === 'left' ? 0 : 9); s < length; s += 14 + next() * 14)
      ctx.sprite(next() < 0.6 ? 'column' : 'column-broken', s, lateral(4 + next() * 2));
    for (let s = 60; s < length; s += 40 + next() * 50) ctx.sprite('cypress', s, lateral(10 + next() * 12));
  }
  for (let s = 250; s < length; s += 300 + next() * 300)
    ctx.sprite('ruin-arch', s, next() < 0.5 ? roadLeft(12) : roadRight(12));
  for (let s = 500; s < length; s += 900 + next() * 400)
    ctx.sprite('temple-front', s, next() < 0.5 ? roadLeft(70 + next() * 40) : roadRight(70 + next() * 40));
  ctx.arcs.forEach((arc, k) => {
    if (k % 3 === 1 && arc.end < (ctx.finish ?? length) - 300)
      patch(ctx, arc.start - 20, arc.start + 30, 'DIRT', DIRT.color, DIRT.blotch);
  });
  finishCrowd(ctx, 3.0);
}

/** METROPOLIS' ground: grey pavements along the avenues. */
export const METROPOLIS_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x585860), hex(0x5e5e66)],
  verge: { width: 4, material: 'SHOULDER', colors: [hex(0x8a8a90), hex(0x929298)] },
  rumble: [hex(0xf0d020), hex(0x303030)],
};

/** High-rise fronts along `boundary` from `start` to `end`: blocks of 18–30 m with rows of lit and dark windows. */
function towers(ctx: StageContext, boundary: string, start: number, end: number, seed: number) {
  const next = random(seed);
  const faces = [hex(0x6a7888), hex(0x8a8070), hex(0x5a6070), hex(0xa09880), hex(0x4a5868)];
  for (let s = start; s < end - 10;) {
    const block = Math.min(end - s, 30 + next() * 40),
      height = 18 + Math.floor(next() * 5) * 3;
    ctx.wall(
      boundary,
      s,
      s + block,
      [
        { color: faces[Math.floor(next() * faces.length)]!, bottom: 0, top: height },
        { color: hex(0x2a2e3a), bottom: 0, top: 3.2, every: 9, part: 5 },
        ...Array.from({ length: Math.floor((height - 4) / 3) }, (_, k) => ({
          color: k % 3 === 1 ? hex(0xe8d890) : hex(0x2a3448),
          bottom: 4.2 + k * 3,
          top: 5.6 + k * 3,
          every: 2.4,
          part: 1.4,
        })),
      ],
      { sound: 'wall' },
    );
    s += block;
  }
}

/**
 * METROPOLIS: right-angle corners between high-rise fronts, modern lamps, towers beyond, a city tunnel, and wet
 * streets under an overcast sky, to the finish under the dusk skyline.
 */
export function metropolis(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(505);
  for (const [id, lateral] of [
    ['fronts-left', roadLeft(4)],
    ['fronts-right', roadRight(4)],
  ] as const)
    ctx.boundary(id, [
      [0, lateral],
      [length, lateral],
    ]);
  const finish = ctx.finish ?? length;
  // The city tunnel: under a block in the middle of the stage.
  const tunnel = ctx.arcs.filter((a) => a.start > 1500).map((a) => a.end + 60)[0] ?? 1600;
  const tunnelEnd = tunnel + 320;
  for (const id of ['fronts-left', 'fronts-right']) {
    towers(ctx, id, 150, tunnel, id === 'fronts-left' ? 512 : 513);
    ctx.wall(
      id,
      tunnel,
      tunnelEnd,
      [
        { color: hex(0x8a8e94), bottom: 0, top: 6 },
        { color: hex(0x4a4e54), bottom: 0, top: 0.6 },
        { color: hex(0xf0f0e0), bottom: 4.6, top: 4.9, every: 8, part: 3 },
      ],
      { sound: 'wall' },
    );
    towers(ctx, id, tunnelEnd, finish - 120, id === 'fronts-left' ? 514 : 515);
  }
  ctx.sprite('tunnel-portal', tunnel, edge('a', 'right'));
  ctx.sprites('tunnel-rib', tunnel + 8, tunnelEnd - 4, 8, edge('a', 'right'));
  ctx.strip(tunnel, tunnelEnd, roadLeft(4), roadRight(4), hex(0x403e44));
  // Wet streets: one stretch before the tunnel and one after it.
  const corners = ctx.arcs.filter((a) => a.start > 600 && a.end < finish - 500);
  const before = corners.find((a) => a.end < tunnel - 300);
  const after = corners.find((a) => a.start > tunnelEnd + 400);
  if (before) wetStretch(ctx, before.start - 200, before.end + 80, 'sky-city');
  ctx.environment(tunnel + 2, 'TUNNEL', 'sky-tunnel', 'cut');
  ctx.environment(tunnelEnd, 'CITY', 'sky-city', 'cut');
  if (after) wetStretch(ctx, after.start - 200, after.end + 80, 'sky-city');
  ctx.sprites('lamp-street', 160, tunnel - 10, 28, roadLeft(1.2));
  ctx.sprites('lamp-street', 174, tunnel - 10, 28, roadRight(1.2));
  ctx.sprites('lamp-street', tunnelEnd + 20, length, 28, roadLeft(1.2));
  ctx.sprites('lamp-street', tunnelEnd + 34, length, 28, roadRight(1.2));
  for (let s = 100; s < length; s += 50 + next() * 70)
    ctx.sprite(
      next() < 0.5 ? 'skyscraper-glass' : 'skyscraper-stone',
      s,
      next() < 0.5 ? roadLeft(30 + next() * 40) : roadRight(30 + next() * 40),
    );
  finishCrowd(ctx, 2.0);
}
