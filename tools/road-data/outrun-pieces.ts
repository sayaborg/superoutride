/**
 * OUTRUN's pieces ([OUTRUN road data](../../docs/outrun-road-data.md#pieces)): each stage, the fork's two sides and
 * the five goals, each one shape whatever comes before or after it. A span is the stretch of pieces one lane naming
 * holds, from a Link (or the road's start) to the next: a stage to its fork stretch's six lanes, a fork side, or a last
 * stage with its goal. Positions are the span's own, from 0.
 */
import { requireInput } from '../course/authoring-io.js';
import {
  centreLaneAt,
  drivenLanes,
  LANE,
  LANE_RULE_WIDTHS,
  START_WIDTH,
  TOUCHING,
  UNIT_METRES,
} from './outrun-cross-section.js';
import { Quadratic, type QuadraticPiece } from './offset-plan.js';
import { monotoneCubic } from './monotone-cubic.js';
import { pathHeadings, type HeadingTable } from './heading-plan.js';
import { type Stage, type Stretch } from './outrun-road.js';
import { roadWidths, type Path, type SceneryPoint, type WidthHeightPoint } from './road-tables.js';

/** Every stage's length, positions: a constant of the main CPU's program. */
const STAGE_LENGTH = 1948;
/** The fork stretch, as the main CPU runs it (0x8780 to 0x89B6). */
export const FORK = Object.freeze({
  /** The roads part by 8 units a position from 63, where a stage piece ends and the fork piece begins. */
  parts: 63,
  spread: 8,
  /** The route is chosen, and the next stage's sky wipes in, where the road width passes 0x168 (360). */
  chosen: 0x168,
  /** The road not taken ends where the width passes 0x300 (768), which it then holds. */
  apart: 0x300,
  /**
   * The second curve ends at 362: the roads close from there by 8 a position, as a V, to the next stage's 212, where
   * the next stage begins (431.5).
   */
  closes: 362,
});
/** Where a fork piece ends, the fork stretch's: where its roads have closed. */
const FORK_END = FORK.closes + (FORK.apart - TOUCHING) / FORK.spread;
/** The goal stretch: its road to 600; the roads part from 182 by 8 a position to 768. */
const GOAL = Object.freeze({ parts: 182, spread: 8, apart: 0x300, end: 600 });
/** A dead end's lanes narrow to nothing over its last positions. */
const DEAD_END = 2;
/** A road that comes in grows to its lanes over one position. */
const GROWS = 1;
/** A verge's outer edge moves no faster than one metre across for this many along. */
const VERGE_RAMP = 6;

/** A line `units` right of lane `lane`'s `side`: where a road's centre, or a verge, is held. */
export interface LaneRef {
  readonly lane: string;
  readonly side: 'left' | 'right';
  readonly units: number;
}
/** A road the original draws over `[from, to]`, its centre where `centre` says. */
export interface DrawnRoad {
  readonly from: number;
  readonly to: number;
  readonly centre: LaneRef;
}
/** A knot of a verge's outer edge: the ground's width beyond `ref`, an outermost lane's edge, `outward` (−1 left). */
export interface VergeKnot {
  readonly at: number;
  readonly ref: LaneRef;
  readonly outward: -1 | 1;
}
/** A stretch of a span shown in one stage's colors and sky. */
export interface SpanStage {
  readonly from: number;
  readonly stage: Stage;
  /** How its sky arrives there. */
  readonly arrival: 'cut' | 'wipe' | 'rise';
}

/** A span: its plan's path and offsets, its lanes and drawn roads, verges, heights and scenery. */
export interface Span {
  readonly length: number;
  /** The original's road path P over the span: its headings at the span's positions. */
  readonly headings: HeadingTable;
  /** The road width, units. */
  readonly width: Quadratic;
  /** The centre lane's centre, metres right of P. */
  readonly offset: Quadratic;
  /** The original's middle, units right of P. */
  middle(position: number): number;
  /** Lanes and medians (`m…`), left to right, and the centre lane. */
  readonly order: readonly string[];
  readonly centreLane: string;
  /** Each lane's and median's width at a position, units. */
  lanes(position: number): ReadonlyMap<string, number>;
  /** Where a width changes slope, besides the road width's own breaks. */
  readonly laneBreaks: readonly number[];
  readonly roads: readonly DrawnRoad[];
  readonly verges: { readonly left: readonly VergeKnot[]; readonly right: readonly VergeKnot[] };
  /** Each piece's height points, from its start, which its profile runs and closes over `[from, to]`. */
  readonly heights: readonly {
    readonly from: number;
    readonly to: number;
    readonly cut: number;
    readonly points: readonly WidthHeightPoint[];
  }[];
  readonly scenery: readonly SceneryPoint[];
  readonly stages: readonly SpanStage[];
  /** Where its stage ends, its finish or the goal checkpoint, if it has one. */
  readonly stageEnd?: number;
  /** Where its goal stretch begins, if it has one, and the goal's number (the scene after it). */
  readonly goal?: { readonly at: number; readonly number: number };
  /**
   * Where the original ends a stretch it runs (a stage at 1948, the fork stretch at its end, a goal stretch at 600):
   * its road position starts again at 0 for the next one, and the scenery point it was running ends.
   */
  readonly resets: readonly number[];
  /** Where a road is chosen in it, if one is. */
  readonly choice?: Choice;
}

/** Where a road is chosen: the roads part at `parts`, the road taken on `side` (−1 left). */
export interface Choice {
  readonly parts: number;
  readonly side: -1 | 1;
}

const ramp = (p: number, from: number, to: number, a: number, b: number) =>
  p <= from ? a : p >= to ? b : a + ((b - a) * (p - from)) / (to - from);
const shifted = <T extends { readonly position: number }>(points: readonly T[], by: number, from = -Infinity) =>
  points.filter((p) => p.position >= from).map((p) => ({ ...p, position: p.position + by }));

/** A function of the position by stretches, each `f` of the road width over `[.., to)`. */
function offsetOf(
  width: Quadratic,
  rules: readonly { to: number; f: (w: number) => number; breaks: readonly number[] }[],
) {
  const pieces: QuadraticPiece[] = [];
  let from = width.pieces[0]!.from;
  for (const rule of rules) {
    const part = width.pieces
      .filter((q) => q.to > from && q.from < rule.to)
      .map((q) => {
        const [a, b] = [Math.max(q.from, from), Math.min(q.to, rule.to)];
        const t = a - q.from;
        return { from: a, to: b, a: q.a + q.b * t + q.c * t * t, b: q.b + 2 * q.c * t, c: q.c };
      });
    if (part.length) pieces.push(...new Quadratic(part).map((w) => rule.f(w) * UNIT_METRES, rule.breaks).pieces);
    from = rule.to;
  }
  return new Quadratic(pieces);
}

/**
 * The road width of spans laid one after another, the original's straight between its points, joined as one monotone
 * cubic through them over the whole road (`monotoneCubic`), written at each span's every position: each span's, from
 * the joined width at its positions, straight between them.
 */
export function joinedWidth(widths: readonly Quadratic[]): Quadratic[] {
  const knots: [number, number][] = [];
  let start = 0;
  for (const width of widths) {
    for (const q of width.pieces)
      for (const [p, v] of [
        [q.from, q.a],
        [q.to, q.a + q.b * (q.to - q.from) + q.c * (q.to - q.from) ** 2],
      ] as const) {
        const last = knots.at(-1);
        if (last && Math.abs(start + p - last[0]) < 1e-9) {
          requireInput(Math.abs(v - last[1]) < 1e-6, '/widths', `The road width jumps at ${start + p}`);
          continue;
        }
        knots.push([start + p, v]);
      }
    start += width.pieces.at(-1)!.to;
  }
  const curve = monotoneCubic(knots);
  start = 0;
  return widths.map((width) => {
    const end = width.pieces.at(-1)!.to;
    const at = [...Array.from({ length: Math.ceil(end) }, (_, p) => p), end];
    const own = start;
    start += end;
    return through(at.filter((p, i) => i === 0 || p > at[i - 1]!).map((p) => [p, curve(own + p)] as const));
  });
}

/** A function straight between knots `[position, value]`, from the first's position to the last's. */
const through = (knots: readonly (readonly [number, number])[]) =>
  new Quadratic(
    knots.slice(1).map(([p, v], i) => {
      const [p0, v0] = knots[i]!;
      return { from: p0, to: p, a: v0, b: (v - v0) / (p - p0), c: 0 };
    }),
  );

/** The width through knots `[position, value]` over `[0, end]`: straight between them, level beyond them. */
function straight(knots: readonly (readonly [number, number])[], end: number): Quadratic {
  return through(
    [[0, knots[0]![1]] as const, ...knots, [end, knots.at(-1)![1]] as const].filter(
      ([p], i, all) => p >= 0 && p <= end && (i === 0 || p > all[i - 1]![0]),
    ),
  );
}

/**
 * A stretch's road path P over its positions `[from, to]`, from `from`: its heading at each position there, and at
 * `to`, where it is no position, the last one's carried on.
 */
function headingsOver(path: Path, from: number, to: number): HeadingTable {
  const all = pathHeadings(path);
  requireInput(Math.ceil(to) < all.length, '/path', `The path ends before position ${to}`);
  const positions: number[] = [];
  const headings: number[] = [];
  for (let p = from; p <= to; p++) {
    positions.push(p - from);
    headings.push(all[p]!);
  }
  if (positions.at(-1)! < to - from) {
    positions.push(to - from);
    headings.push(headings.at(-1)!);
  }
  return { positions, headings };
}

/** Table `b` after table `a`, from `a`'s end on, its first heading `a`'s last: one road path, its turns kept. */
function joined(a: HeadingTable, b: HeadingTable): HeadingTable {
  const [end, turn] = [a.positions.at(-1)!, a.headings.at(-1)! - b.headings[0]!];
  return {
    positions: [...a.positions, ...b.positions.slice(1).map((p) => p + end)],
    headings: [...a.headings, ...b.headings.slice(1).map((h) => h + turn)],
  };
}

/** A fork's path as side `side` takes it: L's as the fork stretch's, R's its mirror. */
const mirrored = (table: HeadingTable, side: -1 | 1): HeadingTable =>
  side < 0 ? table : { ...table, headings: table.headings.map((h) => -h) };

/** Lane b's centre is `centreLaneAt` from the roads' middle, lane e's its mirror. */
const sideOf = (centre: 'b' | 'e') => (centre === 'b' ? 1 : -1);
/** The two roads' lanes, a, b, c | m0 | d, e, f, by `drivenLanes`. */
const STAGE_ORDER = ['a', 'b', 'c', 'm0', 'd', 'e', 'f'] as const;
const drivenAt = (w: number) => {
  const { a, b, c, m, d, e, f } = drivenLanes(w);
  return new Map(Object.entries({ a, b, c, m0: m, d, e, f }));
};
/** Where a verge is held: lane `lane`'s outer edge `side`. */
const verge = (lane: string, side: 'left' | 'right'): LaneRef => ({ lane, side, units: 0 });
/**
 * Where the verge of a road coming in or going out is held: its outer lane's edge as its lanes are wide, `sign` (−1 left)
 * beyond lane `lane`'s `side`, its centre `TOUCHING` from that side and its outer edge `TOUCHING` from its centre.
 */
const farVerge = (lane: string, side: 'left' | 'right', sign: -1 | 1): LaneRef => ({
  lane,
  side,
  units: sign * 2 * TOUCHING,
});

/**
 * A stage piece, GO (0) to its end: a stage of rows 1 to 4 on into its fork stretch to 63, where the roads part, its
 * roads widened by 8 a position (the fork's spread) to six clean lanes there; a stage of row 5 to 1948, its goal
 * following (`goalSpan`). `first` is the game's first stage, which starts at road width 450 and its grid.
 */
export function stageSpan(
  stage: Stage,
  options: {
    readonly first: boolean;
    readonly fork: (Stretch & { readonly path: Path }) | null;
    readonly goal?: GoalOptions;
    /** Its centre lane: b, or e where it is entered from a fork's left side (the road taken is its right half). */
    readonly centreLane?: 'b' | 'e';
    /** Its road width, the road's joined width (`joinedWidth`); the original's, straight between its points, if none. */
    readonly width?: Quadratic;
  },
): Span {
  const { fork } = options;
  const centre = options.centreLane ?? 'b';
  if (options.goal) return goalSpan(stage, options.goal, options.first, centre, options.width);
  requireInput(fork !== null, '/fork', 'A stage of rows 1 to 4 ends in its fork stretch');
  const length = STAGE_LENGTH + FORK.parts;
  const knots = roadWidths(stage.widthsHeights, STAGE_LENGTH, options.first ? START_WIDTH : TOUCHING);
  const end = knots.at(-1)![1];
  requireInput(end <= TOUCHING, `/stages/${stage.number}`, `Stage ${stage.number} ends wider than six lanes`);
  // Widened from the stage's last width to 212 at the fork's spread, reaching it at the end.
  if (end < TOUCHING) knots.push([length - (TOUCHING - end) / FORK.spread, end]);
  knots.push([length, TOUCHING]);
  const width = options.width ?? straight(knots, length);
  return {
    length,
    headings: headingsOver(stage.path, 0, length),
    width,
    offset: offsetOf(width, [{ to: length, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS }]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes: (p: number) => drivenAt(width.at(p)),
    laneBreaks: [],
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: TOUCHING } },
      { from: 0, to: length, centre: { lane: 'f', side: 'right', units: -TOUCHING } },
    ],
    verges: {
      left: [0, length].map((at) => ({ at, ref: verge('a', 'left'), outward: -1 as const })),
      right: [0, length].map((at) => ({ at, ref: verge('f', 'right'), outward: 1 as const })),
    },
    heights: [
      {
        from: 0,
        to: length,
        cut: STAGE_LENGTH,
        points: stage.widthsHeights.filter((p) => p.kind === 0 && p.position < STAGE_LENGTH),
      },
    ],
    scenery: stage.scenery.filter((p) => p.position < STAGE_LENGTH),
    stages: [{ from: 0, stage, arrival: 'cut' }],
    resets: [STAGE_LENGTH],
  } satisfies Span;
}

/**
 * A fork piece, the fork stretch from 63 to 431.5 as the side taken sees it, `side` −1 left (L) or 1 right (R, L's
 * mirror). L's lanes are g, h, i | m0 | a, b, c | m1 | d, e, f: the road taken a, b, c (centre lane b); the road not
 * taken d, e, f, its centre 2w right of the taken one's, ending where the width reaches 768 (132.5), its lanes narrowing
 * to nothing over its last two positions; the road coming in g, h, i, from 362 2w left of it, growing over a position.
 * The width parts from 212 by 8 a position from 63 to 768, holds, and from 362 closes by 8 to 212 at 431.5. Before 362
 * the road taken is w left of P; from 362 it runs on P's heading and moves 768 − w toward the road coming in, the two
 * meeting as a straight, even V about P's 1536 left. R's are the mirror: a, b, c (not taken) | m0 | d, e, f (taken,
 * centre lane e) | m1 | j, k, l (coming in).
 */
export function forkSpan(
  fork: Stretch & { readonly path: Path },
  side: -1 | 1,
  from: Stage,
  to: Stage,
  given?: Quadratic,
): Span {
  const start = FORK.parts;
  const at = (p: number) => p - start;
  const length = FORK_END - start;
  const apartAt = FORK.parts + (FORK.apart - TOUCHING) / FORK.spread;
  const width =
    given ??
    straight(
      [
        [0, TOUCHING],
        [at(apartAt), FORK.apart],
        [at(FORK.closes), FORK.apart],
        [length, TOUCHING],
      ],
      length,
    );
  // The road taken's centre from P: w toward its side before the V, 1536 − w after; the original's middle, P or the V's.
  const held = at((apartAt + FORK.closes) / 2);
  const offset = offsetOf(width, [
    { to: held, f: (w) => side * w, breaks: [] },
    { to: length, f: (w) => side * (2 * FORK.apart - w), breaks: [] },
  ]);
  const middle = (p: number) => (p >= at(FORK.closes) ? side * 2 * FORK.apart : 0);
  const median = (p: number) => 2 * (width.at(p) - TOUCHING);
  const dead = (p: number) => ramp(p, at(apartAt) - DEAD_END, at(apartAt), LANE, 0);
  const coming = (p: number) => ramp(p, at(FORK.closes), at(FORK.closes) + GROWS, 0, LANE);
  const wipe = at(FORK.parts + (FORK.chosen - TOUCHING) / FORK.spread);
  const breaks = [at(apartAt) - DEAD_END, at(apartAt), at(FORK.closes), at(FORK.closes) + GROWS];
  const common = {
    length,
    choice: { parts: at(FORK.parts), side },
    headings: mirrored(headingsOver(fork.path, start, FORK_END), side),
    width,
    offset,
    middle,
    laneBreaks: breaks,
    heights: [
      {
        from: 0,
        to: length,
        cut: length,
        points: fork.widthsHeights
          .filter((p) => p.kind === 0)
          .map((p) => ({ ...p, position: Math.max(0, at(p.position)) })),
      },
    ],
    scenery: shifted(fork.scenery, -start, start),
    stages: [
      { from: 0, stage: from, arrival: 'cut' as const },
      { from: wipe, stage: to, arrival: 'wipe' as const },
    ],
    resets: [length],
  };
  // Each verge ramps out to the road coming in before it comes, and back from the road ending after it ends.
  const comesIn = at(FORK.closes);
  const ends = at(apartAt);
  if (side < 0)
    return {
      ...common,
      order: ['g', 'h', 'i', 'm0', 'a', 'b', 'c', 'm1', 'd', 'e', 'f'],
      centreLane: 'b',
      lanes: (p) =>
        new Map([
          ...(['g', 'h', 'i'] as const).map((l) => [l, coming(p)] as const),
          ['m0', median(p)],
          ...(['a', 'b', 'c'] as const).map((l) => [l, LANE] as const),
          ['m1', median(p)],
          ...(['d', 'e', 'f'] as const).map((l) => [l, dead(p)] as const),
        ]),
      roads: [
        { from: 0, to: length, centre: { lane: 'a', side: 'left', units: TOUCHING } },
        { from: 0, to: ends, centre: { lane: 'd', side: 'left', units: TOUCHING } },
        { from: comesIn, to: length, centre: { lane: 'i', side: 'right', units: -TOUCHING } },
      ],
      verges: {
        left: vergeRamps(verge('a', 'left'), farVerge('i', 'right', -1), -1, comesIn, length, 'in'),
        right: vergeRamps(verge('c', 'right'), farVerge('d', 'left', 1), 1, ends, length, 'out'),
      },
    };
  return {
    ...common,
    order: ['a', 'b', 'c', 'm0', 'd', 'e', 'f', 'm1', 'j', 'k', 'l'],
    centreLane: 'e',
    lanes: (p) =>
      new Map([
        ...(['a', 'b', 'c'] as const).map((l) => [l, dead(p)] as const),
        ['m0', median(p)],
        ...(['d', 'e', 'f'] as const).map((l) => [l, LANE] as const),
        ['m1', median(p)],
        ...(['j', 'k', 'l'] as const).map((l) => [l, coming(p)] as const),
      ]),
    roads: [
      { from: 0, to: ends, centre: { lane: 'c', side: 'right', units: -TOUCHING } },
      { from: 0, to: length, centre: { lane: 'f', side: 'right', units: -TOUCHING } },
      { from: comesIn, to: length, centre: { lane: 'j', side: 'left', units: TOUCHING } },
    ],
    verges: {
      left: vergeRamps(verge('d', 'left'), farVerge('c', 'right', -1), -1, ends, length, 'out'),
      right: vergeRamps(verge('f', 'right'), farVerge('j', 'left', 1), 1, comesIn, length, 'in'),
    },
  };
}

/**
 * A verge's knots on side `sign` (−1 left): beyond the road kept (`kept`) throughout, and beyond another road (`other`)
 * where it is there: one coming `in` at `at` to the span's end, the verge ramping out to it before; one going `out` at
 * `at`, there from the start, the verge ramping back after. The ramps' lengths are found when the span is laid
 * (`rampLength`), marked here by NaN.
 */
function vergeRamps(
  kept: LaneRef,
  other: LaneRef,
  sign: -1 | 1,
  at: number,
  length: number,
  way: 'in' | 'out',
): VergeKnot[] {
  const outward = sign;
  return way === 'in'
    ? [
        { at: 0, ref: kept, outward },
        { at: Number.NaN, ref: kept, outward },
        { at, ref: other, outward },
        { at: length, ref: other, outward },
      ]
    : [
        { at: 0, ref: other, outward },
        { at, ref: other, outward },
        { at: Number.NaN, ref: kept, outward },
        { at: length, ref: kept, outward },
      ];
}
/** A verge ramp's length along, metres, for a move of `across` metres. */
export const rampLength = (across: number) => VERGE_RAMP * Math.abs(across);

/** What a goal span needs beside its stage: its goal stretch and the goals' path. */
export interface GoalOptions {
  readonly stretch: Stretch;
  readonly path: Path;
  /** The goal's number, the byte at 0xE4EC for its stage. */
  readonly number: number;
}

/**
 * A last stage with its goal piece, GO to the goal stretch's 600 (from 1948): lanes a, b, c | m0 | d, e, f. Over the
 * stage, and the goal stretch to 182, the stage's last width; from 182 the roads part by 8 a position to 768, where
 * the road not taken, the right (d, e, f), ends, its lanes narrowing to nothing over its last two positions. Where the
 * goal's width point takes (the next tick after its second height point: from 182 on but at goal 2, whose point at 162
 * comes while the width is still the stage's), the width then closes at 256 × 16/303 units a position to 0, the road
 * taken coming back to P.
 */
function goalSpan(stage: Stage, goal: GoalOptions, first: boolean, centre: 'b' | 'e', given?: Quadratic): Span {
  const offsetAt = STAGE_LENGTH;
  const at = (p: number) => p + offsetAt;
  const length = at(GOAL.end);
  const knots = roadWidths(stage.widthsHeights, STAGE_LENGTH, first ? START_WIDTH : TOUCHING);
  const w0 = knots.at(-1)![1];
  const apart = at(GOAL.parts + (GOAL.apart - w0) / GOAL.spread);
  const heights = goal.stretch.widthsHeights.filter((p) => p.kind === 0);
  const point = goal.stretch.widthsHeights.find((p) => p.kind !== 0)!;
  // The width point is read the tick after the second height point; it acts where the width differs from its target.
  const closes = (heights[1]?.position ?? 0) >= GOAL.parts;
  const rate = (Math.abs(point.speed) * 16) / 303;
  knots.push([at(GOAL.parts), w0], [apart, GOAL.apart]);
  const returned = apart + (GOAL.apart - point.value) / rate;
  if (closes) knots.push([returned, point.value]);
  knots.push([length, knots.at(-1)![1]]);
  const width = given ?? straight(knots, length);
  const dead = (p: number) => ramp(p, apart - DEAD_END, apart, LANE, 0);
  const lanes = (p: number) => {
    if (p < apart - DEAD_END) return drivenAt(width.at(p));
    const right = dead(p);
    const m0 =
      p < apart ? 2 * (width.at(p) - TOUCHING) : ramp(p, apart, apart + DEAD_END, 2 * (width.at(apart) - TOUCHING), 0);
    return new Map(Object.entries({ a: LANE, b: LANE, c: LANE, m0, d: right, e: right, f: right }));
  };
  requireInput(width.at(apart - DEAD_END) >= TOUCHING, '/goal', 'The road not taken ends before the roads are apart');
  return {
    length,
    headings: joined(headingsOver(stage.path, 0, STAGE_LENGTH), headingsOver(goal.path, 0, GOAL.end)),
    width,
    offset: offsetOf(width, [
      { to: apart, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS },
      { to: length, f: (w) => -sideOf(centre) * w, breaks: [] },
    ]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes,
    laneBreaks: [apart - DEAD_END, apart, apart + DEAD_END],
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: TOUCHING } },
      { from: 0, to: apart - DEAD_END, centre: { lane: 'f', side: 'right', units: -TOUCHING } },
      { from: apart - DEAD_END, to: apart, centre: { lane: 'd', side: 'left', units: TOUCHING } },
    ],
    verges: {
      left: [0, length].map((p) => ({ at: p, ref: verge('a', 'left'), outward: -1 as const })),
      right: [
        { at: 0, ref: verge('f', 'right'), outward: 1 as const },
        { at: apart - DEAD_END, ref: verge('f', 'right'), outward: 1 as const },
        { at: apart, ref: farVerge('d', 'left', 1), outward: 1 as const },
        { at: Number.NaN, ref: verge('c', 'right'), outward: 1 as const },
        { at: length, ref: verge('c', 'right'), outward: 1 as const },
      ],
    },
    heights: [
      {
        from: 0,
        to: STAGE_LENGTH,
        cut: STAGE_LENGTH,
        points: stage.widthsHeights.filter((p) => p.kind === 0 && p.position < STAGE_LENGTH),
      },
      { from: STAGE_LENGTH, to: length, cut: length, points: heights },
    ],
    scenery: [...stage.scenery.filter((p) => p.position < STAGE_LENGTH), ...shifted(goal.stretch.scenery, offsetAt)],
    stages: [{ from: 0, stage, arrival: 'cut' }],
    stageEnd: STAGE_LENGTH,
    goal: { at: STAGE_LENGTH, number: goal.number },
    resets: [STAGE_LENGTH, length],
  };
}

/** A heading table over its positions `[from, to]`, from `from`: its ends' headings straight between its entries. */
function slicedTable({ positions, headings }: HeadingTable, from: number, to: number): HeadingTable {
  const at = (p: number) => {
    const i = Math.max(
      1,
      positions.findIndex((q) => q >= p),
    );
    const [p0, p1] = [positions[i - 1]!, positions[i]!];
    return headings[i - 1]! + ((headings[i]! - headings[i - 1]!) * (p - p0)) / (p1 - p0);
  };
  const inner = positions.flatMap((p, i) => (p > from && p < to ? [[p - from, headings[i]!] as const] : []));
  const entries = [[0, at(from)] as const, ...inner, [to - from, at(to)] as const];
  return { positions: entries.map(([p]) => p), headings: entries.map(([, h]) => h) };
}

/**
 * `span` over its positions `[from, to]`, from 0: its path, widths and offset cut there, everything else moved back by
 * `from`; a piece's heights kept where the piece begins within it, running on past its end where the piece does.
 */
export function sliceSpan(span: Span, from: number, to: number): Span {
  const cut = (q: Quadratic) =>
    new Quadratic(
      q.pieces
        .filter((p) => p.to > from && p.from < to)
        .map((p) => {
          const [a, b] = [Math.max(p.from, from), Math.min(p.to, to)];
          const t = a - p.from;
          return { from: a - from, to: b - from, a: p.a + p.b * t + p.c * t * t, b: p.b + 2 * p.c * t, c: p.c };
        }),
    );
  const inside = (p: number) => p >= from && p <= to;
  const verge = (knots: readonly VergeKnot[]) => {
    // A ramp's knot, placed when the span is laid, between the knots either side of it.
    const kept = knots.filter((k, i) => {
      if (!Number.isNaN(k.at)) return inside(k.at);
      const before = knots
        .slice(0, i)
        .filter((j) => !Number.isNaN(j.at))
        .at(-1)!;
      const after = knots.slice(i + 1).find((j) => !Number.isNaN(j.at))!;
      return before.at >= from && after.at <= to;
    });
    const first = knots.filter((k) => !Number.isNaN(k.at) && k.at <= from).at(-1) ?? knots[0]!;
    const last = knots.find((k) => !Number.isNaN(k.at) && k.at >= to) ?? knots.at(-1)!;
    return [
      ...(kept[0]?.at === from ? [] : [{ ...first, at: from }]),
      ...kept,
      ...(kept.at(-1)?.at === to ? [] : [{ ...last, at: to }]),
    ].map((k) => ({ ...k, at: k.at - from }));
  };
  return {
    ...span,
    length: to - from,
    headings: slicedTable(span.headings, from, to),
    width: cut(span.width),
    offset: cut(span.offset),
    middle: (p) => span.middle(p + from),
    lanes: (p) => span.lanes(p + from),
    laneBreaks: span.laneBreaks.filter((p) => p > from && p < to).map((p) => p - from),
    roads: span.roads
      .filter((r) => r.to > from && r.from < to)
      .map((r) => ({ ...r, from: Math.max(r.from, from) - from, to: Math.min(r.to, to) - from })),
    verges: { left: verge(span.verges.left), right: verge(span.verges.right) },
    heights: span.heights
      .filter((h) => h.from >= from && h.from < to)
      .map((h) => ({ ...h, from: h.from - from, to: h.to - from, cut: h.cut - from })),
    scenery: span.scenery
      .filter((p) => p.position >= from && p.position < to)
      .map((p) => ({ ...p, position: p.position - from })),
    stages: span.stages
      .filter((st, i) => (span.stages[i + 1]?.from ?? Infinity) > from && st.from < to)
      .map((st) => ({ ...st, from: Math.max(0, st.from - from) })),
    resets: span.resets.filter((p) => p > from && p <= to).map((p) => p - from),
    ...(span.stageEnd !== undefined && inside(span.stageEnd)
      ? { stageEnd: span.stageEnd - from }
      : { stageEnd: undefined }),
    ...(span.goal && inside(span.goal.at) ? { goal: { ...span.goal, at: span.goal.at - from } } : { goal: undefined }),
    ...(span.choice && inside(span.choice.parts)
      ? { choice: { ...span.choice, parts: span.choice.parts - from } }
      : { choice: undefined }),
  };
}

/**
 * `span` with the road's entry before it: `entry` positions of straight at its start's width, lanes and offset, level
 * and in its colors, everything else moved on by `entry` (the road's ends and ramps at 0 reaching back to the entry).
 */
export function withEntry(span: Span, entry: number): Span {
  const on = (p: number) => (p === 0 ? 0 : p + entry);
  const moved = (q: Quadratic) =>
    new Quadratic([
      { from: 0, to: entry, a: q.at(0), b: 0, c: 0 },
      ...q.pieces.map((piece) => ({ ...piece, from: piece.from + entry, to: piece.to + entry })),
    ]);
  const back = (p: number) => Math.max(0, p - entry);
  return {
    ...span,
    length: span.length + entry,
    headings: {
      positions: [0, ...span.headings.positions.map((p) => p + entry)],
      headings: [span.headings.headings[0]!, ...span.headings.headings],
    },
    width: moved(span.width),
    offset: moved(span.offset),
    middle: (p) => span.middle(back(p)),
    lanes: (p) => span.lanes(back(p)),
    laneBreaks: span.laneBreaks.map((p) => p + entry),
    roads: span.roads.map((r) => ({ ...r, from: on(r.from), to: r.to + entry })),
    verges: {
      left: span.verges.left.map((k) => ({ ...k, at: on(k.at) })),
      right: span.verges.right.map((k) => ({ ...k, at: on(k.at) })),
    },
    heights: span.heights.map((h) => ({ ...h, from: h.from + entry, to: h.to + entry, cut: h.cut + entry })),
    scenery: span.scenery.map((p) => ({ ...p, position: p.position + entry })),
    stages: span.stages.map((st) => ({ ...st, from: on(st.from) })),
    resets: span.resets.map((p) => p + entry),
    ...(span.stageEnd !== undefined ? { stageEnd: span.stageEnd + entry } : {}),
    ...(span.goal ? { goal: { ...span.goal, at: span.goal.at + entry } } : {}),
    ...(span.choice ? { choice: { ...span.choice, parts: span.choice.parts + entry } } : {}),
  };
}

/** Where a last stage entered from a fork's left side turns its centre lane back to b for its goal, positions. */
export const GOAL_CENTRE = 1946;
