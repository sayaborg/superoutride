/**
 * OUTRUN's pieces ([OUTRUN road data](../../../docs/outrun-road-data.md#pieces)): each stage, the fork's two sides and
 * the five goals, each one shape whatever comes before or after it. A span is the stretch of pieces one lane naming
 * holds, from a Link (or the road's start) to the next: a stage to where its roads part, a fork side, or a last
 * stage with its goal. Positions are the span's own, from 0.
 */
import { contractUnmet } from '../shared/conversion-errors.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { CENTRE_INSIDE, centreLaneAt, drivenLanes, LANE, LANE_RULE_WIDTHS } from './outrun-cross-section.js';
import { levelBeyond, Quadratic, straightThrough, type QuadraticPiece } from '../shared/quadratic.js';
import { monotoneCubic, writtenAt } from '../shared/monotone-cubic.js';
import { pathHeadings, type HeadingTable } from '../shared/heading-plan.js';
import { type ForkStretch, type Parting, type Stage, type Stretch } from './outrun-road.js';
import { widthRate, type ProgramClock } from '../out-run-hardware/clock.js';
import { roadWidths, type Path, type SceneryPoint, type WidthHeightPoint } from '../out-run-hardware/road-tables.js';
import { UNIT_METRES } from '../out-run-hardware/constants.js';
import { TOUCHING } from './outrun-constants.js';

/** Where a fork piece ends, the fork stretch's: where its roads have closed. */
const forkEnd = ({ closes, apart, spread }: ForkStretch['rules']) => closes + (apart - TOUCHING) / spread;
/** The middle of the V the road coming in closes, units from P on the side taken: twice the roads' 768 apart. */
const vMiddle = ({ apart }: ForkStretch['rules']) => 2 * apart;

/** A line `units` right of lane `lane`'s `side`: where a road's centre is held. */
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
/**
 * The road not taken where the roads part, on its own curvature, the original's (K, 2026-10-24): from `from` to `to`,
 * where the original stops drawing it (768), its centre `w` (the road width) out on side `side` (−1 left) from the
 * mirror of P across P's tangent at `from`. It is laid where it passes in the world, on the road taken's cross-section
 * (`outrun-roads.ts`).
 */
export interface LeavingRoad {
  readonly from: number;
  readonly to: number;
  readonly side: -1 | 1;
}
/** A stretch of a span shown in one stage's colors and sky. */
export interface SpanStage {
  readonly from: number;
  readonly stage: Stage;
}

/** A span: its plan's path and offsets, its lanes and drawn roads, heights and scenery. */
export interface Span {
  /** OUTRUN's clock, by which a position is metres along P (`positionMetres`). */
  readonly clock: ProgramClock;
  readonly length: number;
  /** The original's road path P over the span: its headings at the span's positions. */
  readonly headings: HeadingTable;
  /** The road width, units: the road's joined width (`joinedWidth`), which what is drawn follows. */
  readonly width: Quadratic;
  /**
   * The original's road width, units, straight between its points: what the original's program decides by a width
   * (whether the roads are apart as an object appears) is decided by it.
   */
  readonly original: Quadratic;
  /** The centre lane's centre, metres right of P. */
  readonly offset: Quadratic;
  /** The original's middle, units right of P. */
  middle(position: number): number;
  /**
   * Lanes and medians (`m…`), left to right, and the centre lane. A Section's ground reaches from its outermost lanes,
   * zero wide ones counted.
   */
  readonly order: readonly string[];
  readonly centreLane: string;
  /** Each lane's and median's width at a position, units. */
  lanes(position: number): ReadonlyMap<string, number>;
  /** Where a width changes slope, besides the road width's own breaks. */
  readonly laneBreaks: readonly number[];
  readonly roads: readonly DrawnRoad[];
  readonly leaving?: LeavingRoad;
  /** Where the piece is cut into Sections whatever its road's passages (a fork's 362). */
  readonly sections?: readonly number[];
  /** Each piece's height points, from its start `from`, which the road's profile runs in its order. */
  readonly heights: readonly {
    readonly from: number;
    readonly points: readonly WidthHeightPoint[];
  }[];
  readonly scenery: readonly SceneryPoint[];
  readonly stages: readonly SpanStage[];
  /** Where its stage ends, its finish or the goal checkpoint, if it has one. */
  readonly stageEnd?: number;
  /** Where its goal stretch begins, if it has one, and the goal's number (the scene after it). */
  readonly goal?: { readonly at: number; readonly number: number };
  /**
   * Where the original ends a stretch it runs (a stage at 1948, the fork stretch at its end, a goal stretch at its path's):
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
    return writtenAt(
      curve,
      at.filter((p, i) => i === 0 || p > at[i - 1]!),
      own,
    );
  });
}

/**
 * A stretch's road path P over its positions `[from, to]`, from `from`: its heading at each position there, and at
 * `to`, where it is no position (or the path's end, its entries' count), the last one's carried on.
 */
function headingsOver(path: Path, from: number, to: number): HeadingTable {
  const all = pathHeadings(path);
  requireInput(to <= all.length, '/path', `The path ends before position ${to}`);
  const positions: number[] = [];
  const headings: number[] = [];
  for (let p = from; p <= Math.min(to, all.length - 1); p++) {
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
/** Lane widths nearer than this, units, are one: the lanes' rule gives one width by two sums (`drivenLanes`). */
const SAME_WIDTH = 1e-9;
/**
 * Lanes `[lane, start, end]` changing one after another from `from`, each by `spread` a position, joined as a width the
 * original changes is (`monotoneCubic`), each beginning where the one before it ends.
 */
function inTurn(lanes: readonly (readonly [string, number, number])[], from: number, spread: number) {
  let at = from;
  const timed = lanes.map(([lane, start, end]) => {
    const change = Math.abs(end - start);
    const to = at + (change > SAME_WIDTH ? change / spread : 0);
    const timing = {
      lane,
      from: at,
      to,
      width:
        to > at
          ? monotoneCubic([
              [at, start],
              [to, end],
            ])
          : () => end,
    };
    at = to;
    return timing;
  });
  return {
    widths: (p: number) => timed.map((l) => [l.lane, l.width(p)] as const),
    breaks: timed.flatMap((l) => [l.from, l.to]),
  };
}

/**
 * The lanes where the roads part at `parts`, the stage's at its last road width `w0` (`drivenLanes`) there: the road
 * taken's three on side `side` (−1 left, a, b, c; 1 right, d, e, f) widening to one lane each, the other three beside
 * them narrowing to nothing one after another from the outside (K, 2026-10-24), each by `spread` a position.
 */
function partedLanes(w0: number, side: -1 | 1, parts: number, spread: number) {
  const start = drivenAt(w0);
  const [taken, other] =
    side < 0
      ? [
          ['a', 'b', 'c'],
          ['f', 'e', 'd'],
        ]
      : [
          ['d', 'e', 'f'],
          ['a', 'b', 'c'],
        ];
  const widening = taken.map((l) => inTurn([[l, start.get(l)!, LANE]], parts, spread));
  const narrowing = inTurn(
    other.map((l) => [l, start.get(l)!, 0] as const),
    parts,
    spread,
  );
  return {
    widths: (p: number) => new Map([...widening.flatMap((l) => l.widths(p)), ...narrowing.widths(p)]),
    breaks: [...widening.flatMap((l) => l.breaks), ...narrowing.breaks],
  };
}

/**
 * The centre lane's centre, metres right of P, of a road taken on side `side` (−1 left) whose centre is `taken(p)`
 * units from P: its outer edge 212 beyond, its lanes laid in from it; written at the span's every position and the
 * lanes' breaks over `[from, to]`.
 */
function takenOffset(
  span: { readonly width: Quadratic; lanes(p: number): ReadonlyMap<string, number> },
  centre: string,
  side: -1 | 1,
  taken: (p: number) => number,
  [from, to]: readonly [number, number],
  breaks: readonly number[],
) {
  const outer = side < 0 ? 'a' : 'f';
  const at = [...new Set([from, to, ...span.width.breaks, ...breaks])]
    .filter((p) => p >= from && p <= to)
    .sort((x, y) => x - y);
  return straightThrough(
    at.map((p) => {
      const widths = span.lanes(p);
      return [
        p,
        (taken(p) + side * (CENTRE_INSIDE - widths.get(outer)! - widths.get(centre)! / 2)) * UNIT_METRES,
      ] as const;
    }),
  );
}

/**
 * A stage piece, GO (0) to its end: a stage of rows 1 to 4 on into its fork stretch to 63, where the roads part, at the
 * width it ends at; a stage of row 5 to 1948, its goal following (`goalSpan`). `start` is the road width the game's
 * first stage starts at with its grid, null for every other stage.
 */
export function stageSpan(
  stage: Stage,
  options: {
    readonly start: number | null;
    readonly fork: ForkStretch | null;
    readonly goal?: GoalOptions;
    /** Its centre lane: b, or e where it is entered from a fork's left side (the road taken is its right half). */
    readonly centreLane?: 'b' | 'e';
    /** Its road width, the road's joined width (`joinedWidth`); the original's, straight between its points, if none. */
    readonly width?: Quadratic;
    readonly clock: ProgramClock;
  },
): Span {
  const { fork, clock } = options;
  const centre = options.centreLane ?? 'b';
  if (options.goal) return goalSpan(stage, options.goal, options.start, centre, clock, options.width);
  requireInput(fork !== null, '/fork', 'A stage of rows 1 to 4 ends in its fork stretch');
  const length = stage.length + fork.rules.parts;
  const knots = roadWidths(stage.widthsHeights, stage.length, options.start ?? TOUCHING, clock);
  requireInput(
    knots.at(-1)![1] <= TOUCHING,
    `/stages/${stage.number}`,
    `Stage ${stage.number} ends wider than six lanes`,
  );
  const original = levelBeyond(knots, length);
  const width = options.width ?? original;
  return {
    clock,
    length,
    headings: headingsOver(stage.path, 0, length),
    width,
    original,
    offset: offsetOf(width, [{ to: length, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS }]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes: (p: number) => drivenAt(width.at(p)),
    laneBreaks: [],
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: CENTRE_INSIDE } },
      { from: 0, to: length, centre: { lane: 'f', side: 'right', units: -CENTRE_INSIDE } },
    ],
    heights: [{ from: 0, points: stage.widthsHeights.filter((p) => p.kind === 0 && p.position < stage.length) }],
    scenery: stage.scenery.filter((p) => p.position < stage.length),
    stages: [{ from: 0, stage }],
    resets: [stage.length],
  } satisfies Span;
}

/**
 * A fork piece, the fork stretch from 63 to 431.5 as the side taken sees it, `side` −1 left (L) or 1 right (R, L's
 * mirror), as the original's (K, 2026-10-24). The width parts from the stage's last, w₀, by 8 a position from 63 to 768,
 * holds, and from 362 closes by 8 to 212 at 431.5. The roads are w either side of P to 362, and w either side of the V's
 * middle, 1536 on the side taken, from there, where the road coming in appears 2w beyond the road taken; the road not
 * taken leaves on its own curvature (`leaving`) until the original stops drawing it (768). The piece is two Sections, cut
 * at 362. L's lanes to 362 are a, b, c (taken, centre lane b) | d, e, f: at 63 the stage's, a, b, c widening to one
 * lane each and d, e, f narrowing to nothing one after another from the outside; from 362 g, h, i (coming in) | m0 |
 * a, b, c, g, h, i widening one after another from the inside, the median and the lanes beside it by the lanes' rule
 * (`drivenLanes`), six lanes with a, b, c at 431.5; each lane by 8 a position. R's are the mirror: a, b, c | d, e, f (taken, centre lane e), and from 362 d, e, f |
 * m0 | j, k, l (coming in).
 */
export function forkSpan(
  fork: ForkStretch,
  side: -1 | 1,
  from: Stage,
  to: Stage,
  w0: number,
  clock: ProgramClock,
  given?: Quadratic,
): Span {
  const { rules } = fork;
  const start = rules.parts;
  const at = (p: number) => p - start;
  const end = forkEnd(rules);
  const length = end - start;
  const comesIn = at(rules.closes);
  const apart = at(start + (rules.apart - w0) / rules.spread);
  const original = levelBeyond(
    [
      [0, w0],
      [apart, rules.apart],
      [comesIn, rules.apart],
      [length, TOUCHING],
    ],
    length,
  );
  const width = given ?? original;
  const left = side < 0;
  const parted = partedLanes(w0, side, 0, rules.spread);
  const coming = inTurn(
    (left ? ['i', 'h', 'g'] : ['j', 'k', 'l']).map((l) => [l, 0, LANE] as const),
    comesIn,
    rules.spread,
  );
  // From 362 the median and the inner lanes beside it, the road taken's a (f) and the road coming in's i (j), are the
  // lanes' rule's at the width (`drivenLanes`); the lanes timed are each one lane before the rule narrows the median.
  const inner = left ? ['a', 'i'] : ['f', 'j'];
  if (width.at(Math.max(...coming.breaks)) < LANE_RULE_WIDTHS.at(-1)!)
    throw contractUnmet('A fork closes before its lanes come in');
  const lanes = (p: number) => {
    const timed = new Map([...parted.widths(p), ...coming.widths(p)]);
    if (p < comesIn) return timed.set('m0', 0);
    const { c, m } = drivenLanes(width.at(p));
    for (const l of inner) timed.set(l, timed.get(l)! + c - LANE);
    return timed.set('m0', m);
  };
  // The road taken's centre from P: w on its side to 362, then w back from the V's middle.
  const middle = vMiddle(rules);
  const taken = (p: number) => side * (p < comesIn ? width.at(p) : middle - width.at(p));
  const centreLane = left ? 'b' : 'e';
  const ruled = width.map((w) => w, LANE_RULE_WIDTHS).breaks.filter((p) => p > comesIn);
  const breaks = [...parted.breaks, ...coming.breaks, ...ruled];
  const span = { width, lanes };
  // The route is chosen, and the sky wipes in, where the original's width passes 360.
  const chosen = (rules.chosen - w0) / rules.spread;
  return {
    clock,
    length,
    choice: { parts: 0, side },
    headings: mirrored(headingsOver(fork.path, start, end), side),
    width,
    original,
    offset: new Quadratic([
      ...takenOffset(span, centreLane, side, taken, [0, comesIn], breaks).pieces,
      ...takenOffset(span, centreLane, side, taken, [comesIn, length], breaks).pieces,
    ]),
    middle: (p) => (p < comesIn ? 0 : side * middle),
    order: left
      ? ['g', 'h', 'i', 'm0', 'a', 'b', 'c', 'd', 'e', 'f']
      : ['a', 'b', 'c', 'd', 'e', 'f', 'm0', 'j', 'k', 'l'],
    centreLane,
    lanes,
    laneBreaks: breaks,
    roads: [
      {
        from: 0,
        to: length,
        centre: left
          ? { lane: 'a', side: 'left', units: CENTRE_INSIDE }
          : { lane: 'f', side: 'right', units: -CENTRE_INSIDE },
      },
      {
        from: comesIn,
        to: length,
        centre: left
          ? { lane: 'i', side: 'right', units: -CENTRE_INSIDE }
          : { lane: 'j', side: 'left', units: CENTRE_INSIDE },
      },
    ],
    leaving: { from: 0, to: apart, side: left ? 1 : -1 },
    sections: [comesIn],
    heights: [
      {
        from: 0,
        points: fork.widthsHeights
          .filter((p) => p.kind === 0)
          .map((p) => ({ ...p, position: Math.max(0, at(p.position)) })),
      },
    ],
    scenery: shifted(fork.scenery, -start, start),
    stages: [
      { from: 0, stage: from },
      { from: chosen, stage: to },
    ],
    resets: [length],
  };
}

/** What a goal span needs beside its stage: its goal stretch, the goals' path and their parting. */
export interface GoalOptions {
  readonly stretch: Stretch;
  readonly path: Path;
  readonly parting: Parting;
  /** The goal's number, the byte at 0xE4EC for its stage. */
  readonly number: number;
}

/**
 * A last stage with its goal piece, GO to the goal stretch's path's end, 624 (from 1948): lanes a, b, c | m0 | d, e, f.
 * Over the stage, and the goal stretch to 182, the stage's last width w₀; from 182 the roads part by 8 a position to
 * 768, the left road taken, w left of P, as at a fork's L: its lanes a, b, c widening to one lane each, d, e, f
 * narrowing to nothing one after another from the outside, and the right road, not taken, leaving on its own curvature
 * (`leaving`, to 768). Where the goal's width point takes (the next tick after its second height point: from 182 on but
 * at goal 2, whose point at 162 comes while the width is still the stage's), the width then closes at 256 × its rate
 * (`widthRate`) units a position to 0, the road taken coming back to P.
 */
function goalSpan(
  stage: Stage,
  goal: GoalOptions,
  start: number | null,
  centre: 'b' | 'e',
  clock: ProgramClock,
  given?: Quadratic,
): Span {
  const offsetAt = stage.length;
  const at = (p: number) => p + offsetAt;
  const end = goal.path.x.length;
  const length = at(end);
  const knots = roadWidths(stage.widthsHeights, stage.length, start ?? TOUCHING, clock);
  const w0 = knots.at(-1)![1];
  const parting = goal.parting;
  const parts = at(parting.parts);
  const apart = at(parting.parts + (parting.apart - w0) / parting.spread);
  const heights = goal.stretch.widthsHeights.filter((p) => p.kind === 0);
  const point = goal.stretch.widthsHeights.find((p) => p.kind !== 0)!;
  // The width point is read the tick after the second height point; it acts where the width differs from its target.
  const closes = (heights[1]?.position ?? 0) >= parting.parts;
  const rate = Math.abs(point.speed) * widthRate(clock);
  knots.push([parts, w0], [apart, parting.apart]);
  const returned = apart + (parting.apart - point.value) / rate;
  if (closes) knots.push([returned, point.value]);
  knots.push([length, knots.at(-1)![1]]);
  const original = levelBeyond(knots, length);
  const width = given ?? original;
  const parted = partedLanes(w0, -1, parts, parting.spread);
  const lanes = (p: number) => (p < parts ? drivenAt(width.at(p)) : new Map([...parted.widths(p), ['m0', 0]]));
  return {
    clock,
    length,
    headings: joined(headingsOver(stage.path, 0, stage.length), headingsOver(goal.path, 0, end)),
    width,
    original,
    offset: new Quadratic([
      ...offsetOf(width, [{ to: parts, f: (w) => sideOf(centre) * centreLaneAt(w), breaks: LANE_RULE_WIDTHS }]).pieces,
      ...takenOffset({ width, lanes }, centre, -1, (p) => -width.at(p), [parts, length], parted.breaks).pieces,
    ]),
    middle: () => 0,
    order: STAGE_ORDER,
    centreLane: centre,
    lanes,
    laneBreaks: parted.breaks,
    roads: [
      { from: 0, to: length, centre: { lane: 'a', side: 'left', units: CENTRE_INSIDE } },
      { from: 0, to: parts, centre: { lane: 'f', side: 'right', units: -CENTRE_INSIDE } },
    ],
    leaving: { from: parts, to: apart, side: 1 },
    heights: [
      { from: 0, points: stage.widthsHeights.filter((p) => p.kind === 0 && p.position < stage.length) },
      { from: stage.length, points: heights },
    ],
    scenery: [...stage.scenery.filter((p) => p.position < stage.length), ...shifted(goal.stretch.scenery, offsetAt)],
    stages: [{ from: 0, stage }],
    stageEnd: stage.length,
    goal: { at: stage.length, number: goal.number },
    resets: [stage.length, length],
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
 * `from`; a piece's heights kept where the piece begins within it.
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
  const { leaving } = span;
  return {
    ...span,
    length: to - from,
    headings: slicedTable(span.headings, from, to),
    width: cut(span.width),
    original: cut(span.original),
    offset: cut(span.offset),
    middle: (p) => span.middle(p + from),
    lanes: (p) => span.lanes(p + from),
    laneBreaks: span.laneBreaks.filter((p) => p > from && p < to).map((p) => p - from),
    roads: span.roads
      .filter((r) => r.to > from && r.from < to)
      .map((r) => ({ ...r, from: Math.max(r.from, from) - from, to: Math.min(r.to, to) - from })),
    // The road not taken where it parts within the slice: its curvature is reckoned from there.
    leaving:
      leaving && leaving.from >= from && leaving.from < to
        ? { ...leaving, from: leaving.from - from, to: Math.min(leaving.to, to) - from }
        : undefined,
    sections: span.sections?.filter((p) => p > from && p < to).map((p) => p - from),
    heights: span.heights.filter((h) => h.from >= from && h.from < to).map((h) => ({ ...h, from: h.from - from })),
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
 * and in its colors, everything else moved on by `entry` (the road's ends at 0 reaching back to the entry).
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
    original: moved(span.original),
    offset: moved(span.offset),
    middle: (p) => span.middle(back(p)),
    lanes: (p) => span.lanes(back(p)),
    laneBreaks: span.laneBreaks.map((p) => p + entry),
    roads: span.roads.map((r) => ({ ...r, from: on(r.from), to: r.to + entry })),
    ...(span.leaving
      ? { leaving: { ...span.leaving, from: span.leaving.from + entry, to: span.leaving.to + entry } }
      : {}),
    ...(span.sections ? { sections: span.sections.map((p) => p + entry) } : {}),
    heights: span.heights.map((h) => ({ ...h, from: h.from + entry })),
    scenery: span.scenery.map((p) => ({ ...p, position: p.position + entry })),
    stages: span.stages.map((st) => ({ ...st, from: on(st.from) })),
    resets: span.resets.map((p) => p + entry),
    ...(span.stageEnd !== undefined ? { stageEnd: span.stageEnd + entry } : {}),
    ...(span.goal ? { goal: { ...span.goal, at: span.goal.at + entry } } : {}),
    ...(span.choice ? { choice: { ...span.choice, parts: span.choice.parts + entry } } : {}),
  };
}
