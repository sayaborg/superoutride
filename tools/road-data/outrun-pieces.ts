/**
 * OUTRUN's pieces ([Original road data](../../docs/original-road-data.md#pieces)): each stage, the fork's two sides and
 * the five goals, each one shape whatever comes before or after it. A span is the stretch of pieces one lane naming
 * holds, from a Link (or the road's start) to the next: a stage to its fork stretch's six lanes, a fork side, or a last
 * stage with its goal. Positions are the span's own, from 0.
 */
import { requireInput } from '../course/authoring-io.js';
import { roadWidths, stagePlan } from './outrun-course.js';
import {
  centreLaneAt,
  drivenLanes,
  LANE,
  LANE_RULE_WIDTHS,
  ROAD_HALF,
  START_WIDTH,
  TOUCHING,
  UNIT_METRES,
} from './outrun-cross-section.js';
import { POSITION_METRES, Quadratic, rounded, type PlanSegment, type QuadraticPiece } from './offset-plan.js';
import { type Stage, type Stretch } from './outrun-road.js';
import { pathOffset, type Path, type SceneryPoint, type WidthHeightPoint } from './road-tables.js';

/** Every stage's length, positions: a constant of the main CPU's program. */
const STAGE_LENGTH = 1948;
/** The fork stretch, as the main CPU runs it (0x8780 to 0x89B6). */
export const FORK = Object.freeze({
  /**
   * A stage piece ends where its fork stretch has six clean lanes, the fork piece taking it from there: four positions
   * before the roads part, the rounding of that corner (`PARTING_HALF`) within the fork piece.
   */
  start: 59,
  /** The roads part by 8 units a position from 63. */
  parts: 63,
  spread: 8,
  /** The route is chosen, and the next stage's sky wipes in, where the road width passes 0x168 (360). */
  chosen: 0x168,
  /** The road not taken ends where the width passes 0x300 (768), which it then holds. */
  apart: 0x300,
  /** The second curve ends at 362: the roads close from there by 8 a position, as a V, to the next stage's 212. */
  closes: 362,
  /** The next stage begins two positions past where the roads have closed, the corner's rounding within. */
  end: 433.5,
});
/** The goal stretch: its road to 600; the roads part from 182 by 8 a position to 768. */
const GOAL = Object.freeze({ parts: 182, spread: 8, apart: 0x300, end: 600 });
/** A dead end's lanes narrow to nothing over its last positions. */
const DEAD_END = 2;
/** A road that comes in grows to its lanes over one position. */
const GROWS = 1;
/** The sand reaches this far beyond the outermost asphalt, metres. */
export const VERGE = 40;
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
/** A knot of a verge's outer edge: `metres` beyond `ref`. */
export interface VergeKnot {
  readonly at: number;
  readonly ref: LaneRef;
  readonly metres: number;
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
  /** The original's road path P over the span, its segments by position. */
  readonly path: readonly PlanSegment[];
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
  /**
   * Where the original ends a stretch it runs (a stage at 1948, the fork stretch at its end, a goal stretch at 600):
   * its road position starts again at 0 for the next one, and the scenery point it was running ends.
   */
  readonly resets: readonly number[];
  /** Where a road is chosen in it, if one is. */
  readonly choice?: Choice;
}

/**
 * Where a road is chosen: the roads part at `parts`; the road taken lies on `side` (−1 left), its lanes `taken`; the
 * road not taken, its lanes `dead`, ends at `ends`, where its lanes begin to narrow. Lane names hold from the stage
 * before the parting on.
 */
export interface Choice {
  readonly parts: number;
  readonly ends: number;
  readonly side: -1 | 1;
  readonly taken: readonly string[];
  readonly dead: readonly string[];
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
  // The lanes' rule bends the centre lane where the width passes 72 and 212: rounded as the width's corners.
  return new Quadratic(pieces).roundedCorners();
}

/** The plan's path over `[from, to)` of a stretch's, from `from`, and P carried on as a straight to `extend`. */
function pathOver(stretch: Stretch & { readonly path: Path }, from: number, to: number, end: number) {
  const plan = stagePlan(stretch.curves, stretch.path, pathOffset(stretch.curves, stretch.path, end), end);
  return plan
    .filter((s) => s.to > from && s.from < to)
    .map((s) => {
      const [a, b] = [Math.max(s.from, from), Math.min(s.to, to)];
      return { from: a - from, to: b - from, turn: (s.turn * (b - a)) / (s.to - s.from) };
    });
}

/** Where a road width's slope changes inside the rounding, sampled for the lanes. */
const curvedSamples = (width: Quadratic) =>
  width.pieces
    .filter((q) => q.c !== 0)
    .flatMap((q) => Array.from({ length: 7 }, (_, k) => q.from + ((q.to - q.from) * (k + 1)) / 8));

/** Lane b's centre is `centreLaneAt` from the roads' middle, lane e's its mirror. */
const sideOf = (centre: 'b' | 'e') => (centre === 'b' ? 1 : -1);
/** The two roads' lanes, a, b, c | m0 | d, e, f, by `drivenLanes`. */
const STAGE_ORDER = ['a', 'b', 'c', 'm0', 'd', 'e', 'f'] as const;
const drivenAt = (w: number) => {
  const { a, b, c, m, d, e, f } = drivenLanes(w);
  return new Map(Object.entries({ a, b, c, m0: m, d, e, f }));
};
/** A road's asphalt half, units: its edges to the surface's outer edge. */
const ASPHALT_EDGE = ROAD_HALF - TOUCHING;
const verge = (lane: string, side: 'left' | 'right'): LaneRef => ({
  lane,
  side,
  units: side === 'left' ? -ASPHALT_EDGE : ASPHALT_EDGE,
});

/**
 * A stage piece, GO (0) to its end: a stage of rows 1 to 4 on into its fork stretch to 61, its roads widened by 8 a
 * position (the fork's spread) to six clean lanes there, the corner's vertex at 59; a stage of row 5 to 1948, its goal
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
  },
): Span {
  const { fork } = options;
  const centre = options.centreLane ?? 'b';
  if (options.goal) return goalSpan(stage, options.goal, options.first, centre);
  requireInput(fork !== null, '/fork', 'A stage of rows 1 to 4 ends in its fork stretch');
  const length = STAGE_LENGTH + FORK.start;
  const knots = roadWidths(stage.widthsHeights, STAGE_LENGTH, options.first ? START_WIDTH : TOUCHING);
  const end = knots.at(-1)![1];
  requireInput(end <= TOUCHING, `/stages/${stage.number}`, `Stage ${stage.number} ends wider than six lanes`);
  // Widened from the stage's last width to 212 at the fork's spread, the corner's vertex two positions before the end.
  const vertex = length - ROUNDED_HALF;
  if (end < TOUCHING) knots.push([vertex - (TOUCHING - end) / FORK.spread, end], [vertex, TOUCHING]);
  knots.push([length, TOUCHING]);
  const width = rounded(knots, 0, length);
  return {
    length,
    path: pathOver(stage, 0, length, length),
    width,
    offset: offsetOf(width, [{ to: length, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS }]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes: (p: number) => drivenAt(width.at(p)),
    laneBreaks: curvedSamples(width),
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: TOUCHING } },
      { from: 0, to: length, centre: { lane: 'f', side: 'right', units: -TOUCHING } },
    ],
    verges: {
      left: [0, length].map((at) => ({ at, ref: verge('a', 'left'), metres: -VERGE })),
      right: [0, length].map((at) => ({ at, ref: verge('f', 'right'), metres: VERGE })),
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
/** Half a corner's rounding, positions. */
const ROUNDED_HALF = 2;
/**
 * Where the format's coordinate domain (the sand 40 m beyond the asphalt, and 4 m) needs a wider radius than four
 * positions give (K's choice, 2026-10-20): half the rounding where the roads part (the fork's 63 and the goal's 182,
 * where P's curve begins too), and where a goal's roads stop parting and close (15.6°, the road not taken still beside).
 */
const PARTING_HALF = 4;
const TURNING_HALF = 6;
/** And where a goal's road taken is back on P, 13.52 units a position stopping. */
const RETURNED_HALF = 3;
/** And where a fork's roads begin to close, the road coming in on the inside. */
const CLOSING_HALF = 4;

/**
 * A fork piece, the fork stretch from 59 to 433.5 as the side taken sees it, `side` −1 left (L) or 1 right (R, L's
 * mirror). L's lanes are g, h, i | m0 | a, b, c | m1 | d, e, f: the road taken a, b, c (centre lane b); the road not
 * taken d, e, f, its centre 2w right of the taken one's, ending where the width reaches 768 (132.5), its lanes narrowing
 * to nothing over its last two positions; the road coming in g, h, i, from 362 2w left of it, growing over a position.
 * The width parts from 212 by 8 a position from 63 to 768, holds, and from 362 closes by 8 to 212 at 431.5. Before 362
 * the road taken is w left of P; from 362 it runs on P's heading and moves 768 − w toward the road coming in, the two
 * meeting as a straight, even V about P's 1536 left. R's are the mirror: a, b, c (not taken) | m0 | d, e, f (taken,
 * centre lane e) | m1 | j, k, l (coming in).
 */
export function forkSpan(fork: Stretch & { readonly path: Path }, side: -1 | 1, from: Stage, to: Stage): Span {
  const start = FORK.start;
  const at = (p: number) => p - start;
  const length = FORK.end - start;
  const apartAt = FORK.parts + (FORK.apart - TOUCHING) / FORK.spread;
  const closedAt = FORK.closes + (FORK.apart - TOUCHING) / FORK.spread;
  const width = rounded(
    [
      [0, TOUCHING],
      [at(FORK.parts), TOUCHING],
      [at(apartAt), FORK.apart],
      [at(FORK.closes), FORK.apart],
      [at(closedAt), TOUCHING],
      [length, TOUCHING],
    ],
    0,
    length,
    (vertex) => (vertex === at(FORK.parts) ? PARTING_HALF : vertex === at(FORK.closes) ? CLOSING_HALF : ROUNDED_HALF),
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
  const breaks = [
    at(apartAt) - DEAD_END,
    at(apartAt),
    at(FORK.closes),
    at(FORK.closes) + GROWS,
    ...curvedSamples(width),
  ];
  const [left, right] = [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ];
  const common = {
    length,
    choice: {
      parts: at(FORK.parts),
      ends: at(apartAt) - DEAD_END,
      side,
      taken: side < 0 ? left : right,
      dead: side < 0 ? right : left,
    },
    path: pathOver(fork, start, FORK.end, Math.ceil(FORK.end)).map((s) => ({
      ...s,
      turn: side < 0 ? s.turn : -s.turn,
    })),
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
        left: vergeRamps(
          verge('a', 'left'),
          { lane: 'i', side: 'right', units: -TOUCHING - ROAD_HALF },
          -1,
          comesIn,
          length,
          'in',
        ),
        right: vergeRamps(
          verge('c', 'right'),
          { lane: 'd', side: 'left', units: TOUCHING + ROAD_HALF },
          1,
          ends,
          length,
          'out',
        ),
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
      left: vergeRamps(
        verge('d', 'left'),
        { lane: 'c', side: 'right', units: -TOUCHING - ROAD_HALF },
        -1,
        ends,
        length,
        'out',
      ),
      right: vergeRamps(
        verge('f', 'right'),
        { lane: 'j', side: 'left', units: TOUCHING + ROAD_HALF },
        1,
        comesIn,
        length,
        'in',
      ),
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
  const metres = sign * VERGE;
  return way === 'in'
    ? [
        { at: 0, ref: kept, metres },
        { at: Number.NaN, ref: kept, metres },
        { at, ref: other, metres },
        { at: length, ref: other, metres },
      ]
    : [
        { at: 0, ref: other, metres },
        { at, ref: other, metres },
        { at: Number.NaN, ref: kept, metres },
        { at: length, ref: kept, metres },
      ];
}
/** A verge ramp's length along, metres, for a move of `across` metres. */
export const rampLength = (across: number) => VERGE_RAMP * Math.abs(across);

/** What a goal span needs beside its stage: its goal stretch and the goals' path. */
export interface GoalOptions {
  readonly stretch: Stretch;
  readonly path: Path;
}

/**
 * A last stage with its goal piece, GO to the goal stretch's 600 (from 1948): lanes a, b, c | m0 | d, e, f. Over the
 * stage, and the goal stretch to 182, the stage's last width; from 182 the roads part by 8 a position to 768, where
 * the road not taken, the right (d, e, f), ends, its lanes narrowing to nothing over its last two positions. Where the
 * goal's width point takes (the next tick after its second height point: from 182 on but at goal 2, whose point at 162
 * comes while the width is still the stage's), the width then closes at 256 × 16/303 units a position to 0, the road
 * taken coming back to P.
 */
function goalSpan(stage: Stage, goal: GoalOptions, first: boolean, centre: 'b' | 'e'): Span {
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
  const near = (vertex: number, at: number) => Math.abs(vertex - at) < 1e-9;
  const width = rounded(knots, 0, length, (vertex) =>
    near(vertex, at(GOAL.parts))
      ? PARTING_HALF
      : closes && near(vertex, apart)
        ? TURNING_HALF
        : closes && near(vertex, returned)
          ? RETURNED_HALF
          : ROUNDED_HALF,
  );
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
    path: [
      ...pathOver(stage, 0, STAGE_LENGTH, STAGE_LENGTH + 1),
      ...pathOver({ ...goal.stretch, path: goal.path }, 0, GOAL.end, GOAL.end).map((s) => ({
        ...s,
        from: s.from + offsetAt,
        to: s.to + offsetAt,
      })),
    ],
    width,
    offset: offsetOf(width, [
      { to: apart, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS },
      { to: length, f: (w) => -sideOf(centre) * w, breaks: [] },
    ]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes,
    laneBreaks: [apart - DEAD_END, apart, apart + DEAD_END, ...curvedSamples(width)],
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: TOUCHING } },
      { from: 0, to: apart - DEAD_END, centre: { lane: 'f', side: 'right', units: -TOUCHING } },
      { from: apart - DEAD_END, to: apart, centre: { lane: 'd', side: 'left', units: TOUCHING } },
    ],
    verges: {
      left: [0, length].map((p) => ({ at: p, ref: verge('a', 'left'), metres: -VERGE })),
      right: [
        { at: 0, ref: verge('f', 'right'), metres: VERGE },
        { at: apart - DEAD_END, ref: verge('f', 'right'), metres: VERGE },
        { at: apart, ref: { lane: 'd', side: 'left', units: TOUCHING + ROAD_HALF }, metres: VERGE },
        { at: Number.NaN, ref: verge('c', 'right'), metres: VERGE },
        { at: length, ref: verge('c', 'right'), metres: VERGE },
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
    resets: [STAGE_LENGTH, length],
    choice: { parts: at(GOAL.parts), ends: apart - DEAD_END, side: -1, taken: ['a', 'b', 'c'], dead: ['d', 'e', 'f'] },
  };
}

/** A join piece's length, positions: the verge's ramp out to the road coming in (three lanes across), then its growth. */
const JOIN_LENGTH = GROWS + Math.ceil(rampLength(3 * LANE * UNIT_METRES) / POSITION_METRES);

/**
 * A join piece, after a goal piece on the road through all 15 (K's design, 2026-10-20): a straight of `JOIN_LENGTH`
 * at road width 212, lanes a, b, c | m0 | d, e, f. The road taken runs on from the goal; its verge ramps out to the
 * road coming in, which then appears beside it, its lanes growing over a position, so that the next stage begins in
 * six lanes. As a fork's sides, `side` −1 (L) has the road taken as d, e, f (centre lane e), the next stage's right
 * half, the road coming in from the left; 1 (R) its mirror, a, b, c (centre lane b). Level, with no scenery of its
 * own; the next stage's road, ground and sky, its sky rising there.
 */
export function joinSpan(next: Stage, side: -1 | 1): Span {
  const length = JOIN_LENGTH;
  const comesIn = length - GROWS;
  const coming = (p: number) => ramp(p, comesIn, length, 0, LANE);
  const taken = side > 0 ? 'abc' : 'def';
  const lanes = (p: number) =>
    new Map([
      ...[...'abc'].map((l) => [l, taken === 'abc' ? LANE : coming(p)] as const),
      ['m0', 0],
      ...[...'def'].map((l) => [l, taken === 'def' ? LANE : coming(p)] as const),
    ]);
  // The road taken's centre, 212 inside its outer lane's outer edge; the road coming in's, inside its inner lane's.
  const takenCentre =
    side > 0
      ? ({ lane: 'a', side: 'left', units: TOUCHING } as const)
      : ({ lane: 'f', side: 'right', units: -TOUCHING } as const);
  const inner = side > 0 ? ({ lane: 'd', side: 'left' } as const) : ({ lane: 'c', side: 'right' } as const);
  const fixed = side > 0 ? verge('a', 'left') : verge('f', 'right');
  const ramps = vergeRamps(
    side > 0 ? verge('c', 'right') : verge('d', 'left'),
    { ...inner, units: side * (TOUCHING + ROAD_HALF) },
    side,
    comesIn,
    length,
    'in',
  );
  return {
    length,
    path: [{ from: 0, to: length, turn: 0 }],
    width: new Quadratic([{ from: 0, to: length, a: TOUCHING, b: 0, c: 0 }]),
    offset: new Quadratic([{ from: 0, to: length, a: side * centreLaneAt(TOUCHING) * UNIT_METRES, b: 0, c: 0 }]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: side > 0 ? 'b' : 'e',
    lanes,
    laneBreaks: [comesIn],
    roads: [
      { from: 0, to: length, centre: takenCentre },
      { from: comesIn, to: length, centre: { ...inner, units: side * TOUCHING } },
    ],
    verges:
      side > 0
        ? { left: [0, length].map((at) => ({ at, ref: fixed, metres: -VERGE })), right: ramps }
        : { left: ramps, right: [0, length].map((at) => ({ at, ref: fixed, metres: VERGE })) },
    heights: [],
    scenery: [],
    stages: [{ from: 0, stage: next, arrival: 'rise' }],
    // The next stage's road position starts where the join ends.
    resets: [length],
  };
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
    path: span.path
      .filter((p) => p.to > from && p.from < to)
      .map((p) => {
        const [a, b] = [Math.max(p.from, from), Math.min(p.to, to)];
        return { from: a - from, to: b - from, turn: (p.turn * (b - a)) / (p.to - p.from) };
      }),
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
    ...(span.choice && inside(span.choice.parts)
      ? { choice: { ...span.choice, parts: span.choice.parts - from, ends: span.choice.ends - from } }
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
    path: [
      { from: 0, to: entry, turn: 0 },
      ...span.path.map((s) => ({ ...s, from: s.from + entry, to: s.to + entry })),
    ],
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
    ...(span.choice
      ? { choice: { ...span.choice, parts: span.choice.parts + entry, ends: span.choice.ends + entry } }
      : {}),
  };
}

/** Where a last stage entered from a fork's left side turns its centre lane back to b for its goal, positions. */
export const GOAL_CENTRE = 1946;
