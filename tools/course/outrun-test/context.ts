/**
 * The scenery vocabulary of OUTRUN TEST's generator: a stage's context, which its design uses to write surfaces,
 * Boundaries, walls, open limits, sprites and environments in the course document's terms, measured in metres from the
 * stage's start. Production-only; see `tools/course/outrun-test.ts`.
 */

export type Position = { readonly joint: string; readonly offset: number };
export type Lateral =
  | number
  | { readonly lane: string; readonly side: 'left' | 'right' | 'center'; readonly offset: number }
  | { readonly boundary: string; readonly offset: number };
export type Color = number | 'transparent';
export type Arrival = 'cut' | 'wipe' | 'rise';

/** An RGB555 color from 5-bit channels. */
export const rgb = (r: number, g: number, b: number) => (r << 10) | (g << 5) | b;
/** An RGB555 color from 8-bit `0xRRGGBB`. */
export const hex = (value: number) => rgb((value >> 19) & 31, (value >> 11) & 31, (value >> 3) & 31);

/** A stage's ground: what lies beyond its verges, its verges, its road and its lane lines. */
export interface Surfaces {
  /** Beyond the verges (color only), two colors in alternating bands. */
  readonly ground: readonly [Color, Color];
  /** Each verge: its width, material and two colors. */
  readonly verge: { readonly width: number; readonly material: string; readonly colors: readonly [number, number] };
  /** The median between the two roads of a fork or a divided road. */
  readonly median: { readonly material: string; readonly colors: readonly [number, number] };
  readonly road: readonly [number, number];
  readonly line: number;
  /** A rumble strip along each road edge (two colors), or none. */
  readonly rumble: readonly [number, number] | null;
}

export const DEFAULT_SURFACES: Surfaces = {
  ground: [hex(0x4a9a30), hex(0x58a838)],
  verge: { width: 12, material: 'GRASS', colors: [hex(0x4a9a30), hex(0x58a838)] },
  median: { material: 'GRASS', colors: [hex(0x4a9a30), hex(0x58a838)] },
  road: [hex(0x686870), hex(0x707078)],
  line: hex(0xe8e8e8),
  rumble: [hex(0xd83030), hex(0xe8e8e8)],
};

/** The length of a light and dark band pair along the road. */
export const BAND = 40;

interface SpriteOptions {
  readonly palette?: string;
  readonly groundOffset?: number;
  /** A solid object's width in metres; scenery vehicles pass through without it. */
  readonly solid?: number;
  readonly unselectedLink?: string | null;
}

interface Repeat<T> {
  readonly kind: 'repeat';
  readonly every: number;
  readonly count: number;
  readonly elements: readonly T[];
}

/**
 * `count` copies of `element` every `every` metres as the course format writes them: none, the element alone, or a
 * repeat of two or more.
 */
function repeated<T>(element: T, every: number, count: number): (T | Repeat<T>)[] {
  return count < 1 ? [] : count === 1 ? [element] : [{ kind: 'repeat', every, count, elements: [element] }];
}

/** One stage's context: positions, lane lines, and the records its scenery adds. */
export function createStageContext(options: {
  readonly id: string;
  readonly length: number;
  readonly joints: readonly { readonly id: string; readonly s: number }[];
  readonly plan: readonly { readonly length: number; readonly radius?: number; readonly turn?: 'left' | 'right' }[];
  readonly lanes: readonly string[];
  /** The start of the final straight: a forking stage's fork, or a goal stage's finish straight. */
  readonly final: number;
  readonly fork: boolean;
  readonly finish: number | null;
  readonly entryEnd: number;
}) {
  const { joints, length } = options;
  const has = (id: string) => options.lanes.includes(id);
  const leftLane = has('w') ? 'w' : 'a';
  const rightLane = has('e') ? 'e' : has('d') ? 'd' : 'b';
  const clamp = (s: number) => Math.min(length, Math.max(0, s));
  /** A Position measured from the joint nearest station `s`, the earlier of two as near. */
  const at = (s: number): Position => {
    s = clamp(s);
    let best = joints[0]!;
    for (const joint of joints) if (Math.abs(joint.s - s) < Math.abs(best.s - s)) best = joint;
    return { joint: best.id, offset: Math.round((s - best.s) * 1e6) / 1e6 };
  };
  const edge = (lane: string, side: 'left' | 'right' | 'center', offset = 0): Lateral => ({ lane, side, offset });
  // Plan curvature along the stage: signed 1/radius, positive right.
  const arcs: { start: number; end: number; k: number }[] = [];
  let s0 = 0;
  for (const e of options.plan) {
    if (e.radius) arcs.push({ start: s0, end: s0 + e.length, k: (e.turn === 'right' ? 1 : -1) / e.radius });
    s0 += e.length;
  }
  const records = {
    boundaries: [] as unknown[],
    strips: [] as unknown[],
    walls: [] as unknown[],
    openLimits: [] as unknown[],
    sprites: [] as unknown[],
    environments: [] as unknown[],
  };
  const sprite = (image: string, s: number, lateral: Lateral, o: SpriteOptions = {}) => ({
    kind: 'sprite',
    image,
    palette: o.palette ?? 'original',
    at: at(s),
    lateral,
    groundOffset: o.groundOffset ?? 0,
    unselectedLink: o.unselectedLink ?? null,
    body: o.solid ? { width: o.solid, movable: null } : null,
  });
  const context = {
    id: options.id,
    length,
    final: options.final,
    fork: options.fork,
    finish: options.finish,
    entryEnd: options.entryEnd,
    has,
    leftLane,
    rightLane,
    at,
    edge,
    /** The road's outer edges (the outer lanes' edges), offset outward by `offset` metres. */
    roadLeft: (offset = 0) => edge(leftLane, 'left', -offset),
    roadRight: (offset = 0) => edge(rightLane, 'right', offset),
    /** Signed plan curvature at `s` (1/m, positive right). */
    curvature(s: number) {
      return arcs.find((a) => s >= a.start && s < a.end)?.k ?? 0;
    },
    /** The plan's arcs, their start and end stations and signed curvature. */
    arcs: arcs as readonly { readonly start: number; readonly end: number; readonly k: number }[],
    records,
    strip(
      start: number,
      end: number,
      left: Lateral | null,
      right: Lateral | null,
      color: Color | null,
      material: string | null = null,
    ) {
      records.strips.push({ kind: 'strip', start: at(start), end: at(end), left, right, color, material });
    },
    /**
     * Color-only bands between `start` and `end`: `colors[0]` over the first `part` metres of every `every`, so ground
     * motion reads at speed.
     */
    bands(
      start: number,
      end: number,
      left: Lateral | null,
      right: Lateral | null,
      color: Color,
      every: number,
      part = every / 2,
    ) {
      const count = Math.floor((end - start - part) / every) + 1;
      const element = { kind: 'strip', start: at(start), end: at(start + part), left, right, color, material: null };
      records.strips.push(...repeated(element, every, count));
    },
    sprite(image: string, s: number, lateral: Lateral, o: SpriteOptions = {}) {
      if (s < 0 || s > length) return;
      records.sprites.push(sprite(image, s, lateral, o));
    },
    /** A sprite every `every` metres from `start` while it stays at or before `end`. */
    sprites(image: string, start: number, end: number, every: number, lateral: Lateral, o: SpriteOptions = {}) {
      start = Math.max(0, start);
      end = Math.min(length, end);
      if (end < start) return;
      const count = Math.floor((end - start) / every) + 1;
      records.sprites.push(...repeated(sprite(image, start, lateral, o), every, count));
    },
    boundary(id: string, knots: readonly (readonly [s: number, lateral: Lateral])[]) {
      records.boundaries.push({ id, knots: knots.map(([s, lateral]) => ({ at: at(s), lateral })) });
    },
    /**
     * A wall along Boundary `boundary` from `start` to `end`: its strips (each a color between heights `bottom` and
     * `top`, constant along the wall, or stripes repeating every `every` metres), solid or for looks only.
     */
    wall(
      boundary: string,
      start: number,
      end: number,
      strips: readonly {
        readonly color: Color;
        readonly bottom: number;
        readonly top: number;
        readonly every?: number;
        readonly part?: number;
      }[],
      solid: { readonly freeStart?: number | null; readonly freeEnd?: number | null } | null,
    ) {
      start = clamp(start);
      end = clamp(end);
      if (end - start < 1) return;
      records.walls.push({
        boundary,
        start: at(start),
        end: at(end),
        solid: solid && { freeStart: solid.freeStart ?? null, freeEnd: solid.freeEnd ?? null },
        strips: strips.flatMap((strip) => {
          const piece = (from: number, to: number) => ({
            kind: 'strip',
            color: strip.color,
            knots: [
              { at: at(from), bottom: strip.bottom, top: strip.top },
              { at: at(to), bottom: strip.bottom, top: strip.top },
            ],
          });
          // A strip without stripes is one copy over the whole wall.
          if (!strip.every) return repeated(piece(start, end), end - start, 1);
          const part = strip.part ?? strip.every / 2;
          const count = Math.floor((end - start - part) / strip.every) + 1;
          return repeated(piece(start, start + part), strip.every, count);
        }),
      });
    },
    openLimit(side: 'left' | 'right', start: number, end: number) {
      records.openLimits.push({ side, start: at(start), end: at(end) });
    },
    environment(s: number, name: string, image: string, arrival: Arrival, yawOrigin = 0) {
      records.environments.push({ at: at(s), name, background: { image, horizonY: 320, yawOrigin }, arrival });
    },
  };
  return context;
}
export type StageContext = ReturnType<typeof createStageContext>;

/** A deterministic sequence in [0, 1) from `seed`, for placing varied scenery. */
export function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
