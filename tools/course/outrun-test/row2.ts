import { hex, random, type StageContext, type Surfaces } from './context.js';

/** Wet asphalt: darker and bluer than dry, with lighter reflective bands across it. */
export const WET = { color: hex(0x3a4258), reflection: hex(0x7080a8) };

/**
 * A wet stretch of road from `start` to `end`: WET_ASPHALT across the road, its reflective bands, and an overcast sky
 * over it from `skyBefore` metres before it to `skyAfter` after, returning to `sky`.
 */
export function wetStretch(
  ctx: StageContext,
  start: number,
  end: number,
  sky: string,
  skyBefore = 150,
  skyAfter = 100,
) {
  const { roadLeft, roadRight } = ctx;
  ctx.strip(start, end, roadLeft(), roadRight(), WET.color, 'WET_ASPHALT');
  ctx.bands(start + 4, end - 4, roadLeft(-0.4), roadRight(-0.4), WET.reflection, 16, 2.5);
  ctx.environment(Math.max(1, start - skyBefore), 'RAIN', 'sky-overcast', 'wipe');
  ctx.environment(end + skyAfter, 'CLEAR', sky, 'wipe');
}

/** Chevron boards on the outside of every arc tighter than `radius`, before its entry and through it. */
export function chevrons(ctx: StageContext, radius: number, outside: { left: number; right: number }) {
  for (const arc of ctx.arcs) {
    if (Math.abs(1 / arc.k) > radius) continue;
    const right = arc.k > 0;
    for (let s = arc.start - 20; s < Math.min(arc.end, arc.start + 120); s += 30)
      ctx.sprite(
        right ? 'chevron-right' : 'chevron-left',
        s,
        right ? ctx.roadLeft(outside.left) : ctx.roadRight(outside.right),
      );
  }
}

/** GATEWAY's ground: mown lawn verges, white kerbs, darker meadow beyond. */
export const GATEWAY_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x3c7a2c), hex(0x448432)],
  verge: { width: 9, material: 'GRASS', colors: [hex(0x5aa83c), hex(0x66b444)] },
  rumble: [hex(0xe8e8e0), hex(0xa8a8a0)],
};

/** GATEWAY's two extra boulevard lanes, one each side, from the entry straight until the fork straight. */
export function gatewayWidths(_length: number, fork: number) {
  const lane = (from: number, to: number): readonly (readonly [number, number])[] => [
    [0, 0],
    [from, 0],
    [from + 150, 3.6],
    [to - 150, 3.6],
    [to, 0],
  ];
  return { w: lane(200, fork - 100), e: lane(260, fork - 40) } as const;
}

/**
 * GATEWAY: a wide boulevard of four lanes between rows of round trees and cypresses, classic lamps and flower beds,
 * passing under a stone gate every few hundred metres; gentle rolling country under a fair sky.
 */
export function gateway(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(202);
  ctx.sprites('tree-round', 30, ctx.final, 24, roadLeft(6));
  ctx.sprites('tree-round', 42, ctx.final, 24, roadRight(6));
  ctx.sprites('cypress', 54, ctx.final, 48, roadLeft(9.5));
  ctx.sprites('cypress', 18, ctx.final, 48, roadRight(9.5));
  ctx.sprites('lamp-classic', 24, ctx.final, 36, roadLeft(1.6));
  ctx.sprites('lamp-classic', 42, ctx.final, 36, roadRight(1.6));
  ctx.sprites('flower-bed', 36, ctx.final, 72, roadRight(3.6));
  ctx.sprites('flower-bed', 72, ctx.final, 72, roadLeft(3.6));
  // Trees in the meadows beyond.
  for (let s = 60; s < length; s += 50 + next() * 80) {
    ctx.sprite('tree-round-lime', s, roadLeft(20 + next() * 30));
    ctx.sprite('tree-round-lime', s + 25, roadRight(20 + next() * 30));
  }
  // The stone gates, over the boulevard's middle.
  for (let s = 600; s < ctx.final - 200; s += 760) ctx.sprite('stone-gate', s, edge('a', 'right'));
  ctx.sprites('tree-round', ctx.final + 40, length - 20, 30, roadLeft(6));
}

/** CLIFF ROAD's ground: narrow gravel shoulders, the cliff top beyond the rock face. */
export const CLIFF_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x6a5a4c), hex(0x74624f)],
  verge: { width: 2.5, material: 'SHOULDER', colors: [hex(0x9a8a74), hex(0xa49480)] },
  rumble: [hex(0xd83030), hex(0xe8e8e8)],
};

/**
 * CLIFF ROAD: two lanes along a cliff, a rock face rising on the right and a drop to the sea on the left behind a
 * guardrail with gaps, where a car can go over the edge; sea stacks below; two wet stretches under an overcast sky.
 */
export function cliffRoad(ctx: StageContext) {
  const { length, roadLeft, roadRight } = ctx;
  const next = random(203);
  const edgeS = ctx.final - 60;
  // The drop: transparent ground beyond the left verge shows the sea below the horizon, and a cliff face falls from
  // the verge's edge.
  ctx.strip(0, length, null, roadLeft(2.5), 'transparent');
  ctx.boundary('drop', [
    [0, roadLeft(2.5)],
    [length, roadLeft(2.5)],
  ]);
  ctx.wall(
    'drop',
    120,
    edgeS,
    [
      { color: hex(0x6e5a4a), bottom: -40, top: 0 },
      { color: hex(0x55463a), bottom: -40, top: -0.6, every: 9, part: 3 },
    ],
    null,
  );
  // The rock face on the right, on the course limit: solid rock with darker strata.
  ctx.boundary('face', [
    [0, roadRight(2.5)],
    [length, roadRight(2.5)],
  ]);
  ctx.wall(
    'face',
    150,
    ctx.final - 40,
    [
      { color: hex(0x8a7462), bottom: 0, top: 14 },
      { color: hex(0x6a5848), bottom: 2, top: 3.2 },
      { color: hex(0x6a5848), bottom: 7, top: 8.5 },
      { color: hex(0xa48c76), bottom: 11, top: 14, every: 13, part: 5 },
    ],
    {},
  );
  // The guardrail on the left verge, broken by gaps where the course limit opens over the drop.
  ctx.boundary('rail', [
    [0, roadLeft(1.0)],
    [length, roadLeft(1.0)],
  ]);
  const gaps = [1100, 2300, 3500, 4600].filter((s) => s < edgeS - 200);
  let from = 140;
  for (const gap of [...gaps, edgeS]) {
    ctx.wall(
      'rail',
      from,
      gap,
      [
        { color: hex(0xc8ccd4), bottom: 0.45, top: 0.75 },
        { color: hex(0x9098a4), bottom: 0, top: 0.75, every: 4, part: 0.15 },
      ],
      { freeStart: 0.2, freeEnd: 0.2 },
    );
    if (gap !== edgeS) ctx.openLimit('left', gap, gap + 60);
    from = gap + 60;
  }
  // Sea stacks and rocks in the sea far below, and boulders on the cliff top.
  for (let s = 200; s < length; s += 260 + next() * 300)
    ctx.sprite(next() < 0.5 ? 'sea-stack' : 'cliff-rock', s, roadLeft(40 + next() * 80), { groundOffset: -38 });
  for (let s = 300; s < length; s += 340 + next() * 200)
    ctx.sprite('cliff-rock', s, roadRight(9 + next() * 8), { groundOffset: 14 });
  chevrons(ctx, 320, { left: 1.8, right: 1.5 });
  // Two wet stretches, each over a corner's entry.
  const corners = ctx.arcs.filter((a) => a.start > 800 && a.start < ctx.final - 600);
  for (const arc of [corners[1], corners[corners.length - 2]])
    if (arc) wetStretch(ctx, arc.start - 260, arc.start + 160, 'sky-cliff');
}
