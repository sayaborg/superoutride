import { hex, random, type StageContext, type Surfaces } from './context.js';

/** COASTLINE's ground: a sand beach verge on firm shoulder, dune grass beyond the right verge. */
export const COASTLINE_SURFACES: Partial<Surfaces> = {
  ground: [hex(0x60a040), hex(0x6cac48)],
  verge: { width: 14, material: 'SHOULDER', colors: [hex(0xe0c890), hex(0xe8d4a0)] },
  median: { material: 'GRASS', colors: [hex(0x4a9a30), hex(0x58a838)] },
};

/**
 * COASTLINE: a divided 3+3 coastal highway that merges into six lanes; the sea along its left beyond a sand beach with
 * parasols and rocks, palms along both sides, beach huts, billboards and a lighthouse on a headland. Fast and forgiving:
 * wide firm verges, no walls.
 */
export function coastline(ctx: StageContext) {
  const { length, roadLeft, roadRight, edge } = ctx;
  const next = random(101);
  // The sea beyond the beach, with whitecaps, and the wet sand at its edge.
  ctx.strip(0, length, null, roadLeft(16), hex(0x2060b8));
  ctx.bands(0, length, null, roadLeft(16), hex(0x2a70c8), 60, 20);
  ctx.bands(10, length, roadLeft(40), roadLeft(34), hex(0xd8e8f8), 90, 6);
  ctx.strip(0, length, roadLeft(16), roadLeft(14), hex(0xb89868));
  // Palms along both verges; the left ones leaning to the sea.
  ctx.sprites('palm-bent', 30, length - 20, 46, roadLeft(5));
  ctx.sprites('palm-tall', 52, length - 20, 92, roadLeft(9));
  ctx.sprites('palm-tall', 40, ctx.final, 70, roadRight(6));
  // Parasols on the beach, in pairs of colors, and rocks in the surf.
  for (let s = 120; s < length - 200; s += 70 + next() * 60)
    ctx.sprite(next() < 0.5 ? 'parasol-red' : 'parasol-blue', s, roadLeft(10 + next() * 3));
  for (let s = 300; s < length; s += 180 + next() * 240) ctx.sprite('shore-rock', s, roadLeft(19 + next() * 8));
  // Beach huts and billboards on the right.
  for (const s of [450, 1900, 3300, 4700]) {
    ctx.sprite('beach-hut', s, roadRight(16));
    ctx.sprite('beach-hut', s + 22, roadRight(19));
  }
  for (const s of [900, 2500, 4000, 5400]) ctx.sprite('billboard-coast', s, roadRight(9));
  // The lighthouse on its headland, far left of the road.
  ctx.sprite('lighthouse', 2700, roadLeft(46));
  ctx.sprite('shore-rock', 2690, roadLeft(40));
  ctx.sprite('shore-rock', 2720, roadLeft(52));
  // Shrubs along the divided road's median while it is open.
  ctx.sprites('coast-shrub', 20, 1180, 24, edge('b', 'right', 2));
}
