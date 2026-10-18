/**
 * A stage of OUTRUN as a course document ([Original road data](../../docs/original-road-data.md#course-documents)): its
 * plan from the sub CPU's road path, its lanes from its road width, its strips from its palette words. Nothing is
 * fitted; the constants measured on `k1` are named below.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { MAXIMUM_VEHICLE_REACH } from '../../src/course/course-coordinate-domain.js';
import { POSITION_PER_KMH, tableRuns, TICKS } from './outrun-hills.js';
import {
  bendOf,
  closedGrades,
  LOOK,
  profileOf,
  separatedCrossings,
  stageGrades,
  type Crossing,
  type Profile,
} from './outrun-profile.js';
import type { CurvePoint, HeightTable, Path, Stage, WidthHeightPoint } from './outrun-road.js';
import type { GroundPlacement, ObjectPlacement, StageScenery } from './outrun-scenery.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 6;

/** One road position in metres: each tick the displayed km/h advances it by 0x12F / 65536 positions. */
const POSITION_METRES = 1 / (3.6 * TICKS * POSITION_PER_KMH);

/** Each road's edges lie this many units from its centre; its three lanes are equal. */
export const ROAD_EDGE = 236;
const LANE = (2 * ROAD_EDGE) / 3;
const HALF_LANE = LANE / 2;
/** The road width at the game's start, units. */
export const START_WIDTH = 0x1c2;
/** The road width approaches a width point's target by its speed × 16 / 303 units a position. */
const WIDTH_RATE = 16 / 303;

/** Measured on `k1`: the player picture's width over the lane spacing on its own row. */
const CAR_PER_LANE = 0.5743;
/** Measured on `k1`, units: a lane line's width and an edge band's, which lies outside the road's edge. */
const LANE_LINE = 8;
const EDGE_BAND = 20;
/** Measured on `k1` as time × displayed speed: the surface's light and dark halves together, metres. */
const STRIPE_PERIOD = 6.315;
/**
 * Provisional until the ground's word is read: `k1`'s two sands with its capture's darkening undone by the road's ratio
 * (the ROM's 156 over `k1`'s 148), by half; on `k1` the darker sand lies beside the road's lighter half.
 */
const GROUND = [28471, 29528] as const;
/** The sand beyond each road edge, metres. */
const VERGE = 40;
/** A strip's pieces this close, positions, lie in one run of it: the original's runs leave at most 7.6 between. */
const JOINED = 10;
/** A ground Strip's edge follows its pieces' within this, metres. */
const GROUND_TOLERANCE = 1e-4;

/** A stage's turn at a join is spread over a position or two: headings are read this far inside a segment. */
const JOIN = 2;
/** A straight's heading varies by at most this much inside it, radians. */
const STRAIGHT_TOLERANCE = (0.1 * Math.PI) / 180;
/** The start grid: as many slots as a run's competitors, this far apart. */
const GRID_SLOTS = 16;
const GRID_SPACING = 12;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
/** A road position's station, metres to the micrometre. */
export const stationOf = (position: number) => round(position * POSITION_METRES);

/** Metres a road-width unit: TESTAROSSA's width over its picture's width in units. */
export const lateralScale = (carWidth: number) => carWidth / (CAR_PER_LANE * LANE);

/** The path's heading at each position, radians, unwrapped: counterclockwise positive in its vectors' (x, y). */
function pathHeadings(path: Path): Float64Array {
  const headings = new Float64Array(path.x.length);
  for (let i = 0; i < headings.length; i++) {
    const a = Math.atan2(path.y[i]!, path.x[i]!);
    if (i === 0) headings[i] = a;
    else {
      const step = a - Math.atan2(path.y[i - 1]!, path.x[i - 1]!);
      headings[i] = headings[i - 1]! + Math.atan2(Math.sin(step), Math.cos(step));
    }
  }
  return headings;
}

/** A plan element over road positions `[from, to)`: a straight, or an arc turning left (+) or right (−). */
export interface PlanSegment {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/**
 * The plan: the curves' segments, moved back by the path's offset, laid on the path to `end`. A straight's heading is
 * the path's inside it, which must not vary; an arc turns from the heading at its start to the heading at its end, each
 * a neighbouring straight's or, between two arcs, the path's at the join, so the arcs' turns sum to the path's. Each
 * arc turns the side its kind says.
 */
export function stagePlan(curves: readonly CurvePoint[], path: Path, offset: number, end: number): PlanSegment[] {
  const headings = pathHeadings(path);
  requireInput(end < headings.length, '/path', `The path ends before position ${end}`);
  const starts = curves.map((c) => Math.max(0, c.position - offset));
  const segments = curves.map((c, i) => ({ kind: c.kind, from: starts[i]!, to: Math.min(starts[i + 1] ?? end, end) }));
  const straight = segments.map((s) => {
    if (s.kind !== 1) return null;
    const inside = Array.from(headings.subarray(s.from + JOIN, s.to - JOIN + 1));
    requireInput(inside.length > 0, `/curves/${s.from}`, `The straight at ${s.from} is too short to read`);
    const least = Math.min(...inside),
      most = Math.max(...inside);
    requireInput(
      most - least <= STRAIGHT_TOLERANCE,
      `/curves/${s.from}`,
      `The path turns on the straight at ${s.from}`,
    );
    return (least + most) / 2;
  });
  // The heading where segment i begins: a straight's own, the straight's before it, or the path's between two arcs.
  const headingAt = (i: number) => straight[i] ?? straight[i - 1] ?? headings[segments[i]!.from]!;
  return segments.map((s, i) => {
    if (s.kind === 1) return { from: s.from, to: s.to, turn: 0 };
    const turn = (straight[i + 1] ?? (i + 1 < segments.length ? headingAt(i + 1) : headings[s.to]!)) - headingAt(i);
    requireInput(
      Math.sign(turn) === (s.kind === 3 ? 1 : -1),
      `/curves/${s.from}`,
      `The path turns ${turn > 0 ? 'left' : 'right'} on the curve at ${s.from} of kind ${s.kind}`,
    );
    return { from: s.from, to: s.to, turn };
  });
}

/**
 * The road width along a stage, units, as knots `[position, width]` to `end`: from `start` at 0 (450 at the game's start),
 * each width point approaches its target from its position at its rate until it is reached or the next point begins.
 */
export function roadWidths(points: readonly WidthHeightPoint[], end: number, start = START_WIDTH): [number, number][] {
  const targets = points.filter((p) => p.kind !== 0 && p.position < end);
  const knots: [number, number][] = [[0, start]];
  let width = start;
  targets.forEach((p, i) => {
    const next = targets[i + 1]?.position ?? end;
    knots.push([p.position, width]);
    const rate = Math.abs(p.speed) * WIDTH_RATE;
    if (p.value === width) return;
    requireInput(rate > 0, `/widthsHeights/${p.position}`, `The width point at ${p.position} has no speed`);
    const reach = p.position + Math.abs(p.value - width) / rate;
    if (reach < next) {
      width = p.value;
      knots.push([reach, width]);
    } else {
      width += Math.sign(p.value - width) * rate * (next - p.position);
      knots.push([next, width]);
    }
  });
  knots.push([end, width]);
  return simplified(knots);
}

/** Knots without repeats of a position, nor knots where the value neither starts nor stops changing. */
function simplified(knots: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const knot of knots) {
    if (out.length && out.at(-1)![0] === knot[0]) continue;
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && (b[1] - a[1]) * (knot[0] - b[0]) === (knot[1] - b[1]) * (b[0] - a[0])) out.pop();
    out.push(knot);
  }
  return out;
}

/** Knots `[station, value]` without those within `tolerance` of the line through their neighbours left in. */
function within(knots: readonly [number, number][], tolerance: number): [number, number][] {
  const out: [number, number][] = [];
  for (const knot of knots) {
    if (out.length && out.at(-1)![0] === knot[0]) out.pop();
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && Math.abs(a[1] + ((knot[1] - a[1]) * (b[0] - a[0])) / (knot[0] - a[0]) - b[1]) <= tolerance) out.pop();
    out.push(knot);
  }
  return out;
}

/** `color` (RGB555) over `beneath` by `coverage`, channel by channel. */
const over = (color: number, coverage: number, beneath: number) =>
  [10, 5, 0].reduce(
    (c, shift) =>
      c | (Math.round(((color >> shift) & 31) * coverage + ((beneath >> shift) & 31) * (1 - coverage)) << shift),
    0,
  );

/**
 * The lanes, units, at road width `w`: two roads centred at ±w, each of three lanes. While they are apart the median
 * between them is 2w − 472; where they overlap the outer edges ±(w + 236) are kept and the inner lanes c and d narrow,
 * meeting at 0, until at w = 78.67 they end and lanes b and e meet at 0.
 */
export function lanesAt(w: number) {
  if (w >= ROAD_EDGE) return { a: LANE, b: LANE, c: LANE, m: 2 * (w - ROAD_EDGE), d: LANE, e: LANE, f: LANE };
  if (w >= HALF_LANE) return { a: LANE, b: LANE, c: w - HALF_LANE, m: 0, d: w - HALF_LANE, e: LANE, f: LANE };
  return { a: LANE, b: w + HALF_LANE, c: 0, m: 0, d: 0, e: w + HALF_LANE, f: LANE };
}

/** The knots with a knot added wherever the width crosses `w`, where the lanes' rule changes. */
const crossing = (knots: readonly [number, number][], w: number): [number, number][] =>
  knots.flatMap((knot, i) => {
    const next = knots[i + 1];
    if (!next || (knot[1] - w) * (next[1] - w) >= 0) return [knot];
    return [knot, [knot[0] + ((w - knot[1]) / (next[1] - knot[1])) * (next[0] - knot[0]), w] as [number, number]];
  });

/** The stretches, `[from, to]` positions, where the width is at least `w`. */
function stretchesFrom(knots: readonly [number, number][], w: number): [number, number][] {
  const all = crossing(knots, w);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const [a, wa] = all[i]!,
      [b, wb] = all[i + 1]!;
    if (wa < w || wb < w || b <= a) continue;
    if (out.at(-1)?.[1] === a) out.at(-1)![1] = b;
    else out.push([a, b]);
  }
  return out;
}

/** A curve is written this much shorter at each end, so curves that meet stay apart through rounding, metres. */
const CURVE_GAP = 2e-6;

/**
 * A Section's profile knots, stations `[from, to]`: its ends, and a PVI for each of the profile's bends within, at the
 * intersection of the tangents at the bend's ends. A knot next to an end that joins another Section lies on that end's
 * tangent, so the Sections' grades agree there (`joinsBefore`, `joinsAfter`).
 */
export function sectionProfile(profile: Profile, from: number, to: number, joinsBefore: boolean, joinsAfter: boolean) {
  const knots = [{ s: from, y: profile.height(from), curveLength: 0 }];
  for (const { from: a, to: b } of profile.bends) {
    if (a < from || b > to) continue;
    // To the step of computed values, finer than a station's, so that its tangents' grades hold at both its ends.
    const s = computedValue((a + b) / 2);
    knots.push({ s, y: profile.height(a) + profile.grade(a) * (s - a), curveLength: round(b - a - 2 * CURVE_GAP) });
  }
  knots.push({ s: to, y: profile.height(to), curveLength: 0 });
  const n = knots.length;
  if (n > 2 && joinsBefore) knots[1]!.y = knots[0]!.y + profile.grade(from) * (knots[1]!.s - from);
  if (n > 2 && joinsAfter) knots[n - 2]!.y = knots[n - 1]!.y - profile.grade(to) * (to - knots[n - 2]!.s);
  return knots;
}

/** The plan's centreline at road positions 0, 1, … to its end: each point, metres, and heading, radians. */
function planPoses(plan: readonly PlanSegment[]) {
  const x: number[] = [],
    y: number[] = [],
    h: number[] = [];
  let x0 = 0,
    y0 = 0,
    h0 = 0;
  for (const { from, to, turn } of plan) {
    const k = turn / ((to - from) * POSITION_METRES);
    for (let p = Math.ceil(from); p < to || (p === to && to === plan.at(-1)!.to); p++) {
      const d = (p - from) * POSITION_METRES;
      x[p] = x0 + (k === 0 ? d * Math.cos(h0) : (Math.sin(h0 + k * d) - Math.sin(h0)) / k);
      y[p] = y0 + (k === 0 ? d * Math.sin(h0) : (Math.cos(h0) - Math.cos(h0 + k * d)) / k);
      h[p] = h0 + k * d;
    }
    const d = (to - from) * POSITION_METRES;
    x0 += k === 0 ? d * Math.cos(h0) : (Math.sin(h0 + turn) - Math.sin(h0)) / k;
    y0 += k === 0 ? d * Math.sin(h0) : (Math.cos(h0) - Math.cos(h0 + turn)) / k;
    h0 += turn;
  }
  return { x, y, h };
}

type Point = readonly [number, number];
/** Whether two convex polygons overlap: no edge of either separates them. */
function overlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!,
        [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const nx = y0 - y1,
        ny = x1 - x0;
      const span = (q: readonly Point[]) => q.map(([x, y]) => nx * x + ny * y);
      const pa = span(a),
        pb = span(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

/**
 * Where the plan passes over itself: pairs of road positions at least 200 m apart along it whose cross-sections, each
 * from `sides(p)` metres left of the centreline to its right (`[left, right]`), overlap between them and the next
 * position; a crossing's pairs as stations, grouped where their earlier positions run on.
 */
export function crossingsOf(plan: readonly PlanSegment[], sides: (position: number) => readonly [number, number]) {
  const { x, y, h } = planPoses(plan);
  const corners = x.map((_, p) => {
    const [left, right] = sides(p);
    const nx = -Math.sin(h[p]!),
      ny = Math.cos(h[p]!);
    return [
      [x[p]! + left * nx, y[p]! + left * ny],
      [x[p]! - right * nx, y[p]! - right * ny],
    ] as const;
  });
  const cells = corners.slice(0, -1).map(([l0, r0], p) => {
    const [l1, r1] = corners[p + 1]!;
    return [l0, r0, r1, l1] as Point[];
  });
  // A grid of 50 m squares over the cells' bounds, each listing the cells that reach it.
  const SQUARE = 50;
  const grid = new Map<string, number[]>();
  const squares = (cell: readonly Point[]) => {
    const xs = cell.map(([cx]) => Math.floor(cx / SQUARE)),
      ys = cell.map(([, cy]) => Math.floor(cy / SQUARE));
    const keys: string[] = [];
    for (let i = Math.min(...xs); i <= Math.max(...xs); i++)
      for (let j = Math.min(...ys); j <= Math.max(...ys); j++) keys.push(`${i},${j}`);
    return keys;
  };
  cells.forEach((cell, p) => {
    for (const key of squares(cell)) grid.set(key, [...(grid.get(key) ?? []), p]);
  });
  const apart = Math.ceil(200 / POSITION_METRES);
  const groups: [number, number][][] = [];
  cells.forEach((cell, i) => {
    const near = new Set(squares(cell).flatMap((key) => grid.get(key)!.filter((j) => j >= i + apart)));
    for (const j of [...near].sort((a, b) => a - b)) {
      if (!overlap(cell, cells[j]!)) continue;
      const last = groups.at(-1);
      if (last && i - last.at(-1)![0] <= 1 && Math.abs(j - last.at(-1)![1]) < apart) last.push([i, j]);
      else groups.push([[i, j]]);
    }
  });
  return groups.map((pairs) => pairs.map(([i, j]) => [stationOf(i), stationOf(j)] as const));
}

/**
 * What follows a stage's end on its road, level, positions from there to `end`: its plan, beginning on a straight that
 * carries on the stage's last; its road width knots, given the width the stage ends at.
 */
export interface RoadAfter {
  readonly end: number;
  readonly plan: readonly PlanSegment[];
  widths(width: number): [number, number][];
}

/** A runout of `runout` positions on the stage's path's look-ahead, the road width held. */
export const runoutAfter = (runout: number): RoadAfter => ({
  end: runout,
  plan: [{ from: 0, to: runout, turn: 0 }],
  widths: (width) => [
    [0, width],
    [runout, width],
  ],
});

/** What a stage's road takes beside its tables. */
export interface StageRoadOptions {
  /** The stage's length and its finish, positions; what follows it, and the road width at its start, units. */
  readonly length: number;
  readonly after: RoadAfter;
  readonly startWidth: number;
  /** The path's offset against the curves (`pathOffset`). */
  readonly offset: number;
  /** TESTAROSSA's width, metres. */
  readonly carWidth: number;
  /** The height tables the stage's height points name; the speed its holds are counted at, km/h. */
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  /** The stage's objects and ground, given its road width (units) at a position. */
  readonly objects: (width: (position: number) => number) => StageScenery;
  /** The positions its Sections are cut at, where its profile's bends break. */
  readonly cuts: readonly number[];
  /** Where its crossings are looked for to, positions: where its fork's Section ends, else its end. */
  readonly crossingsTo?: number;
  /** Where its roads switch at a fork, positions: beyond, the roads beside each appear (`CrossSection`). */
  readonly fork?: number;
}

/**
 * A road's cross-section, left to right: its roads of three lanes and the medians between them, `m0`, `m1`, … Its
 * widths (units) at a position, and the positions where a width changes slope.
 */
export interface CrossSection {
  readonly roads: readonly (readonly [string, string, string])[];
  widthsAt(position: number): ReadonlyMap<string, number>;
  readonly knots: readonly number[];
}

/** The positions over which a road that appears at a fork's switch grows to its width. */
const PHANTOM = 1;

/**
 * The cross-section of a road of road width `widthAt`: two roads, a, b, c | m0 | d, e, f (`lanesAt`). Beyond a fork's
 * switch the original carries the car to the other road's place, so beside each road another appears on its far side,
 * the two closing as the road width falls: g, h, i | m0 | a, b, c | m1 | d, e, f | m2 | j, k, l, the roads' median m1
 * held from the switch, the roads appearing there growing from 0 over `PHANTOM` positions; before it m0 and m2 grow as
 * m1 does, so that the roads appear where they stand.
 */
function crossSection(widthAt: (p: number) => number, knots: readonly number[], fork?: number): CrossSection {
  if (fork === undefined)
    return {
      roads: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
      widthsAt: (p) => {
        const { a, b, c, m, d, e, f } = lanesAt(widthAt(p));
        return new Map(Object.entries({ a, b, c, m0: m, d, e, f }));
      },
      knots,
    };
  const apart = lanesAt(widthAt(fork)).m;
  return {
    roads: [
      ['g', 'h', 'i'],
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['j', 'k', 'l'],
    ],
    widthsAt: (p) => {
      const w = lanesAt(widthAt(p));
      if (p < fork)
        return new Map(
          Object.entries({
            g: 0,
            h: 0,
            i: 0,
            m0: w.m,
            a: w.a,
            b: w.b,
            c: w.c,
            m1: w.m,
            d: w.d,
            e: w.e,
            f: w.f,
            m2: w.m,
            j: 0,
            k: 0,
            l: 0,
          }),
        );
      const grown = Math.min(1, (p - fork) / PHANTOM);
      return new Map(
        Object.entries({
          g: w.a * grown,
          h: w.b * grown,
          i: w.c * grown,
          m0: w.m,
          a: w.d,
          b: w.e,
          c: w.f,
          m1: apart,
          d: w.a,
          e: w.b,
          f: w.c,
          m2: w.m,
          j: w.d * grown,
          k: w.e * grown,
          l: w.f * grown,
        }),
      );
    },
    knots: [...new Set([...knots, fork, fork + PHANTOM])].sort((x, y) => x - y),
  };
}

/**
 * A road raised from the original's tables over road positions `[0, end]` (0 GO, the camera's): its plan, its road
 * width (knots, units, with one wherever the lanes' rule changes), its profile and the plan's crossings, its palette and
 * its objects.
 */
export interface Road {
  readonly end: number;
  readonly plan: readonly PlanSegment[];
  widthAt(position: number): number;
  readonly crossSection: CrossSection;
  readonly profile: Profile;
  readonly crossings: readonly Crossing[];
  /** Where its coordinate domain overlaps itself, which its Sections must part. */
  readonly overlaps: readonly Crossing[];
  readonly colors: Stage['colors'];
  readonly objects: readonly ObjectPlacement[];
  readonly grounds: readonly GroundPlacement[];
  /** Metres a road-width unit. */
  readonly metres: number;
}

/**
 * `stage`'s road: its plan, its road width and its profile from its tables, to its length and what follows it. The
 * surface's, lines' and edges' colors must each be two halves repeated, and the centre line the surface.
 */
export function stageRoad(stage: Stage, options: StageRoadOptions): Road {
  const { length, after } = options;
  const end = length + after.end;
  // The stage's last segment, a straight, carries on over the first of what follows on the path's look-ahead.
  const [lead, ...rest] = after.plan;
  requireInput(lead?.turn === 0, '/after', 'What follows the stage does not begin on a straight');
  const plan = [
    ...stagePlan(stage.curves, stage.path, options.offset, length + lead.to),
    ...rest.map((s) => ({ from: length + s.from, to: length + s.to, turn: s.turn })),
  ];
  requireInput(
    plan.find((s) => s.from < length && s.to > length)?.turn === 0,
    '/curves',
    'The stage does not end on a straight',
  );
  const metres = lateralScale(options.carWidth);

  // The road width, and what follows from the width the stage ends at; a knot wherever the lanes' rule changes.
  const own = roadWidths(stage.widthsHeights, length, options.startWidth);
  const widths = crossing(
    crossing(
      [
        ...own,
        ...after
          .widths(own.at(-1)![1])
          .filter(([at]) => at > 0)
          .map(([at, w]) => [length + at, w] as [number, number]),
      ],
      ROAD_EDGE,
    ),
    HALF_LANE,
  );
  const widthAt = (p: number) => {
    const i = widths.findIndex(([at]) => at >= p);
    const [a, wa] = widths[Math.max(0, i - 1)]!,
      [b, wb] = widths[i]!;
    return b === a ? wb : wa + ((wb - wa) * (p - a)) / (b - a);
  };

  // The palette's halves: half 0 then half 1 along the road, each half of the period, half 0 from GO.
  const { surface, laneLines, edges, centreLine } = stage.colors;
  for (const [name, c] of Object.entries({ surface, laneLines, edges, centreLine }))
    requireInput(
      c.rgb555.length === 4 && c.rgb555[2] === c.rgb555[0] && c.rgb555[3] === c.rgb555[1],
      `/colors/${name}`,
      `The ${name} colors are not two halves repeated`,
    );
  requireInput(
    centreLine.rgb555[0] === surface.rgb555[0] && centreLine.rgb555[1] === surface.rgb555[1],
    '/colors/centreLine',
    'The centre line differs from the surface, and its place is not yet read',
  );

  // The profile: the tables' grades, the grades they leave returned, the road closed at height 0, the plan's crossings
  // kept apart; bends break at the Sections' cuts, where Sections join on a tangent or within one bend.
  const total = stationOf(end);
  const runs = tableRuns(
    stage.widthsHeights.filter((p) => p.position < length),
    options.tables,
    () => options.kmh,
  );
  const section = crossSection(
    widthAt,
    widths.map(([at]) => at),
    options.fork,
  );
  // Its roads' sides, metres left and right of lane b's centre (the centreline) to the edge bands, and more.
  const sides =
    (more: number) =>
    (p: number): [number, number] => {
      const widths = [...section.widthsAt(p)];
      const k = widths.findIndex(([id]) => id === 'b');
      const sum = (list: typeof widths) => list.reduce((total, [, w]) => total + w, 0);
      const half = widths[k]![1] / 2;
      return [
        (sum(widths.slice(0, k)) + half + EDGE_BAND) * metres + more,
        (sum(widths.slice(k + 1)) + half + EDGE_BAND) * metres + more,
      ];
    };
  const looked = plan.filter((s) => s.to <= (options.crossingsTo ?? end));
  const crossings = crossingsOf(looked, sides(0));
  // Where its coordinate domain, to the sand's outer edges and the vehicles' reach beyond, overlaps itself.
  const overlaps = crossingsOf(looked, sides(VERGE + MAXIMUM_VEHICLE_REACH));
  const changes = separatedCrossings(
    closedGrades(stageGrades(runs, LOOK, stationOf, stationOf(length), total), total),
    crossings,
    total,
  ).filter((c) => c.from >= 0 && c.to <= total);
  const profile = profileOf(changes.map(bendOf), options.cuts.map(stationOf));
  const scenery = options.objects(widthAt);

  return {
    end,
    plan,
    widthAt,
    crossSection: section,
    profile,
    crossings,
    overlaps,
    colors: stage.colors,
    objects: scenery.placements,
    grounds: scenery.grounds,
    metres,
  };
}

/** A gate of a road's Section: the start, or a line at a road position. */
export type RoadGate =
  | { readonly kind: 'start' }
  | { readonly kind: 'finish' | 'checkpoint'; readonly id: string; readonly position: number }
  | { readonly kind: 'lock' | 'closure'; readonly position: number };

/** One Section of a road, over road positions `[from, to]`, each a joint of its plan. */
export interface RoadSection {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /** Its environment's name, and the sky's background image and its horizon row. */
  readonly name: string;
  readonly sky: { readonly image: string; readonly horizonY: number };
  /** Whether a Link arrives at its start, and leaves its end: its profile then joins on the tangent there. */
  readonly joinsBefore: boolean;
  readonly joinsAfter: boolean;
  readonly gates: readonly RoadGate[];
  /**
   * Two consecutive roads of the cross-section it holds, as lanes a, b, c | m | d, e, f; else all of them, as named
   * there. Its centre lane, b by default.
   */
  readonly roads?: readonly [number, number];
  readonly centerLane?: string;
}

type Lateral = Record<string, unknown>;
const lane = (id: string, side: string, offset = 0): Lateral => ({ lane: id, side, offset: round(offset) });
const boundary = (id: string, offset = 0): Lateral => ({ boundary: id, offset: round(offset) });
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const elementId = (s: PlanSegment) => (s.turn === 0 ? 's' : 'c') + s.from;
/** A plan segment as a plan element, metres. */
const planElement = (s: PlanSegment) => {
  const id = elementId(s);
  const length = round(stationOf(s.to) - stationOf(s.from));
  return s.turn === 0
    ? { kind: 'straight', id, length }
    : { kind: 'arc', id, length, radius: round(length / Math.abs(s.turn)), turn: s.turn > 0 ? 'left' : 'right' };
};

/** The stretches, `[from, to]`, where piecewise linear `values` (knots `[position, value]`) are at least `least`. */
const where = (values: readonly [number, number][], least: number) => stretchesFrom(values, least);
/** The stretches two lists of stretches share. */
const shared = (x: readonly [number, number][], y: readonly [number, number][]) =>
  x.flatMap(([a, b]) =>
    y.flatMap(([c, d]) =>
      Math.min(b, d) > Math.max(a, c) ? [[Math.max(a, c), Math.min(b, d)] as [number, number]] : [],
    ),
  );
/** A width is there where it is wider than this, units. */
const THERE = 1e-9;

/**
 * `section` of `road` as a Section document, its Positions measured from its first joint: the lanes and medians of its
 * roads; the strips from the palette, the surface's halves keeping their phase from GO; the profile; the objects beside
 * the road; the sky facing the heading the plan reaches.
 */
export function roadSection(road: Road, section: RoadSection, cameraDistance: number) {
  const { id, from, to } = section;
  const { metres, profile } = road;
  const { surface, laneLines, edges } = road.colors;
  const m = (units: number) => round(units * metres);
  const band = m(EDGE_BAND),
    lineHalf = m(LANE_LINE) / 2;
  const own = road.plan.filter((s) => s.from >= from && s.to <= to);
  requireInput(own[0]?.from === from && own.at(-1)!.to === to, `/sections/${id}`, `Section ${id} is not cut at joints`);
  const origin = stationOf(from),
    size = round(stationOf(to) - origin);
  const first = elementId(own[0]!);
  const at = (position: number) => ({ joint: first, offset: round(stationOf(position) - origin) });
  const elements = own.map(planElement);
  // The sky keeps its direction in the world: the Section's frame faces the heading its plan reaches.
  let heading = 0;
  for (const e of road.plan.filter((s) => s.to <= from).map(planElement))
    if (e.kind === 'arc') heading += (((e.turn === 'left' ? 1 : -1) * e.length) / e.radius!) * (180 / Math.PI);
  const yawOrigin = round(wrapDegrees(heading));

  // Its roads, as the cross-section names them or as a, b, c | m | d, e, f, and the medians between them.
  const { crossSection: cross } = road;
  const picked = section.roads ? cross.roads.slice(section.roads[0], section.roads[1] + 1) : cross.roads;
  const names = new Map<string, string>(
    section.roads
      ? [
          ...picked.flat().map((source, i) => [source, 'abcdef'[i]!] as [string, string]),
          [`m${section.roads[0]}`, 'm0'],
        ]
      : [...cross.roads.flat(), ...cross.roads.slice(1).map((_, i) => `m${i}`)].map((n) => [n, n] as [string, string]),
  );
  const named = picked.map((lanes) => lanes.map((l) => names.get(l)!));
  const knots = [from, ...cross.knots.filter((p) => p > from && p < to), to];
  const widths = knots.map((p) => {
    const all = cross.widthsAt(p);
    return new Map([...names].map(([source, name]) => [name, all.get(source)!]));
  });
  // The knots of a width, or of a sum of widths, `[position, units]`.
  const valuesOf = (...ids: string[]) =>
    knots.map((p, k) => [p, ids.reduce((sum, i) => sum + widths[k]!.get(i)!, 0)] as [number, number]);
  const sectionMetres = (list: readonly [number, number][]) =>
    list.map(([a, b]) => [stationOf(a) - origin, stationOf(b) - origin] as const);
  // The roads there in this Section and the medians between them: a road that appears beyond it is left out.
  const kept = named.flatMap((lanes, i) => (lanes.some((l) => valuesOf(l).some(([, v]) => v > THERE)) ? [i] : []));
  const roads = kept.map((i) => named[i]!);
  const medians = kept.slice(1).map((i) => `m${i - 1}`);
  const order = roads.flatMap((lanes, i) => [...lanes, ...(i < medians.length ? [medians[i]!] : [])]);
  const lanes = order.flatMap((name) => {
    const values = valuesOf(name).map(([p, v]) => [p, m(v)] as [number, number]);
    if (values.every(([, v]) => v === 0)) return [];
    const width = values.every(([, v]) => v === values[0]![1])
      ? values[0]![1]
      : simplified(values).map(([position, v]) => ({ at: at(position), width: v }));
    return [medians.includes(name) ? { kind: 'median', width } : { kind: 'lane', id: name, width }];
  });

  const strip = (
    a: number,
    b: number,
    left: Lateral | number | null,
    right: Lateral | number | null,
    color: number | null,
    material: string | null,
  ) => ({
    kind: 'strip',
    start: { joint: first, offset: round(a) },
    end: { joint: first, offset: round(b) },
    left,
    right,
    color,
    material,
  });
  const whole = (left: Lateral | null, right: Lateral | null, color: number | null, material: string | null) =>
    strip(0, size, left, right, color, material);

  // An object's x is from the original's middle, the middle median's centre: its lateral is from the centre lane's.
  const centerLane = section.centerLane ?? 'b';
  const middle = medians[Math.floor((medians.length - 1) / 2)]!;
  const fromCentre = (p: number) => {
    const all = cross.widthsAt(p);
    const width = (name: string) => all.get([...names].find(([, n]) => n === name)![0])!;
    let x = 0,
      centre = 0,
      mid = 0;
    for (const name of order) {
      if (name === centerLane) centre = x + width(name) / 2;
      if (name === middle) mid = x + width(name) / 2;
      x += width(name);
    }
    return mid - centre;
  };

  // The ground the scenery lays (Section metres): each run of a strip's pieces one Strip along a Boundary at its left
  // edge, each patch one Strip; its color over the sand, or a patch's over the road's surface, by its coverage.
  const lateralOf = (position: number, units: number) => round((units + fromCentre(position)) * metres);
  const sectionMetre = (position: number) => round(stationOf(position) - origin);
  const laid = road.grounds.filter((g) => g.position < to && g.position + g.length > from);
  const runs: GroundPlacement[][] = [];
  const open = new Map<string, GroundPlacement[]>();
  for (const piece of laid.filter((g) => !g.patch)) {
    const run = open.get(piece.key);
    if (run && piece.position - run.at(-1)!.position <= JOINED) run.push(piece);
    else open.set(piece.key, runs[runs.push([piece]) - 1]!);
  }
  const groundBoundaries: { id: string; knots: { at: unknown; lateral: number }[] }[] = [];
  const groundStrips = runs.flatMap((run, k) => {
    const a = Math.max(from, run[0]!.position),
      b = Math.min(to, run.at(-1)!.position + run.at(-1)!.length);
    if (sectionMetre(b) <= sectionMetre(a)) return [];
    // Its left edge at each piece's start and at the run's ends, each where the piece there lies.
    const covering = (p: number) => [...run].reverse().find((g) => g.position <= p) ?? run[0]!;
    const knots = within(
      [a, ...run.map((g) => g.position).filter((p) => p > a && p < b), b].map(
        (p) => [sectionMetre(p), lateralOf(p, covering(p).left)] as [number, number],
      ),
      GROUND_TOLERANCE,
    );
    const id = `ground-${k}`;
    groundBoundaries.push({
      id,
      knots: knots.map(([station, lateral]) => ({ at: { joint: first, offset: station }, lateral })),
    });
    const { width, color, coverage } = run[0]!;
    return [
      strip(
        knots[0]![0],
        knots.at(-1)![0],
        boundary(id),
        boundary(id, width * metres),
        over(color, coverage, GROUND[1]),
        null,
      ),
    ];
  });
  const patches = laid
    .filter((g) => g.patch)
    .flatMap((g) => {
      const a = sectionMetre(Math.max(from, g.position)),
        b = sectionMetre(Math.min(to, g.position + g.length));
      if (b <= a) return [];
      const left = lateralOf(g.position, g.left);
      return [strip(a, b, left, round(left + g.width * metres), over(g.color, g.coverage, surface.rgb555[1]!), null)];
    });
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO.
  const half = STRIPE_PERIOD / 2;
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: number) => {
    const phase = h * half - origin;
    const start = phase + Math.ceil((a - phase) / STRIPE_PERIOD - 1e-9) * STRIPE_PERIOD;
    const count = Math.floor((b - start - half) / STRIPE_PERIOD + 1e-9) + 1;
    if (count < 1) return [];
    const element = strip(start, start + half, left, right, color, null);
    return [count === 1 ? element : { kind: 'repeat', every: STRIPE_PERIOD, count, elements: [element] }];
  };
  // A line's color over each half where it differs from the surface's, over stretches (Section metres).
  const line = (
    colors: readonly number[],
    stretches: readonly (readonly [number, number])[],
    left: Lateral,
    right: Lateral,
  ) =>
    stretches.flatMap(([a, b]) =>
      ([0, 1] as const).flatMap((h) =>
        colors[h] === surface.rgb555[h] ? [] : halves(h, a, b, left, right, colors[h]!),
      ),
    );
  const firstLane = roads[0]![0]!,
    lastLane = roads.at(-1)![2]!;
  const strips = [
    // The ground, sand beside the roads and between them, and the surface, each by half.
    whole(null, null, GROUND[1], null),
    ...halves(0, 0, size, null, null, GROUND[0]),
    whole(boundary('outer-left'), boundary('road-left'), null, 'SAND'),
    whole(boundary('road-right'), boundary('outer-right'), null, 'SAND'),
    ...groundStrips,
    whole(boundary('road-left'), boundary('road-right'), surface.rgb555[1]!, 'ASPHALT'),
    ...(surface.rgb555[0] === surface.rgb555[1]
      ? []
      : halves(0, 0, size, boundary('road-left'), boundary('road-right'), surface.rgb555[0]!)),
    ...medians.flatMap((median, i) =>
      valuesOf(median).some(([, v]) => v > THERE)
        ? [
            whole(lane(roads[i]![2]!, 'right'), lane(roads[i + 1]![0]!, 'left'), GROUND[1], 'SAND'),
            ...halves(0, 0, size, lane(roads[i]![2]!, 'right'), lane(roads[i + 1]![0]!, 'left'), GROUND[0]),
          ]
        : [],
    ),
    // The patches on the road, under its lines and edge bands, which show through their speckles.
    ...patches,
    // Edge bands: each road's where it is there, outside its outer lanes where they face the sand beyond the roads or
    // a median that holds both roads' bands.
    ...roads.flatMap((lanes, i) => {
      const there = where(valuesOf(...lanes), THERE);
      const facing = (median: string | undefined) =>
        sectionMetres(median === undefined ? there : shared(there, where(valuesOf(median), 2 * EDGE_BAND)));
      return [
        ...line(edges.rgb555, facing(medians[i - 1]), lane(lanes[0]!, 'left', -band), lane(lanes[0]!, 'left')),
        ...line(edges.rgb555, facing(medians[i]), lane(lanes[2]!, 'right'), lane(lanes[2]!, 'right', band)),
      ];
    }),
    // Lane lines: between each road's lanes where both are there.
    ...roads.flatMap((lanes) =>
      lanes
        .slice(0, -1)
        .flatMap((left, k) =>
          line(
            laneLines.rgb555,
            sectionMetres(shared(where(valuesOf(left), THERE), where(valuesOf(lanes[k + 1]!), THERE))),
            lane(left, 'right', -lineHalf),
            lane(left, 'right', lineHalf),
          ),
        ),
    ),
  ];

  const gates = section.gates.map((gate) =>
    gate.kind === 'start'
      ? {
          // The start grid: the player in the last slot, the camera at GO; the slots ahead alternate lanes c and b.
          kind: 'start',
          grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
            at: { joint: first, offset: round(cameraDistance + (GRID_SLOTS - 1 - i) * GRID_SPACING) },
            lane: i % 2 ? 'c' : 'b',
          })),
          bikeGrid: null,
        }
      : 'id' in gate
        ? { kind: gate.kind, id: gate.id, at: at(gate.position) }
        : { kind: gate.kind, at: at(gate.position) },
  );

  return {
    id,
    plan: elements,
    profile: sectionProfile(profile, origin, origin + size, section.joinsBefore, section.joinsAfter).map(
      ({ s, y, curveLength }) => ({
        at: { joint: first, offset: computedValue(s - origin) },
        y,
        curveLength,
      }),
    ),
    lanes,
    centerLane,
    boundaries: [
      {
        id: 'outer-left',
        knots: [from, to].map((p) => ({ at: at(p), lateral: lane(firstLane, 'left', -band - VERGE) })),
      },
      { id: 'road-left', knots: [from, to].map((p) => ({ at: at(p), lateral: lane(firstLane, 'left', -band) })) },
      { id: 'road-right', knots: [from, to].map((p) => ({ at: at(p), lateral: lane(lastLane, 'right', band) })) },
      {
        id: 'outer-right',
        knots: [from, to].map((p) => ({ at: at(p), lateral: lane(lastLane, 'right', band + VERGE) })),
      },
      ...groundBoundaries,
    ],
    strips,
    walls: [],
    openLimits: [],
    // Each object where the camera passes it, its board standing beside the road; the car hits those with a width.
    sprites: road.objects
      .filter((o) => o.position >= from && o.position < to)
      .map((o) => ({
        kind: 'sprite',
        image: o.image,
        palette: o.palette,
        at: at(o.position),
        lateral: round((o.x + fromCentre(o.position)) * metres),
        groundOffset: round(o.y * metres),
        unselectedLink: null,
        body: o.hit === null ? null : { width: round(o.hit * metres), movable: null },
      })),
    environments: [
      {
        at: at(from),
        name: section.name,
        background: { image: section.sky.image, horizonY: section.sky.horizonY, yawOrigin },
        arrival: 'cut',
      },
    ],
    gates,
  };
}

/** What a stage's course takes beside its road's. */
export interface StageCourseOptions extends Omit<StageRoadOptions, 'cuts' | 'after' | 'startWidth'> {
  readonly name: string;
  /** The runout past the stage's length, positions, on the path's look-ahead. */
  readonly runout: number;
  /** The Sections from their first positions, the first from 0: where the plan passes over itself, its passages lie in
   * different Sections (an overpass), each cut at a joint where the road is one. */
  readonly sections: readonly { readonly id: string; readonly from: number }[];
  /** The camera's distance behind the player, metres. */
  readonly cameraDistance: number;
  /** The sky's background image and its horizon row. */
  readonly sky: { readonly image: string; readonly horizonY: number };
}

/**
 * `stage` as a course document, its Positions still measured from each Section's first joint: its road's Sections from
 * road position 0 (GO, the camera's) to the stage's length, the finish, and the runout past it, joined by Links on lane
 * b. Returns the document, its profile, crossings and objects.
 */
export function stageCourse(stage: Stage, options: StageCourseOptions) {
  const { length, sections: cuts } = options;
  const road = stageRoad(stage, {
    ...options,
    after: runoutAfter(options.runout),
    startWidth: START_WIDTH,
    cuts: cuts.map(({ from }) => from),
  });
  const sections = cuts.map(({ id, from }, k) => {
    const to = cuts[k + 1]?.from ?? road.end;
    const gates: RoadGate[] = [
      ...(k === 0 ? [{ kind: 'start' } as const] : []),
      ...(from < length && length <= to ? [{ kind: 'finish', id: `${id}-FINISH`, position: length } as const] : []),
    ];
    return roadSection(
      road,
      {
        id,
        from,
        to,
        name: options.name,
        sky: options.sky,
        joinsBefore: k > 0,
        joinsAfter: k + 1 < cuts.length,
        gates,
      },
      options.cameraDistance,
    );
  });

  const document = {
    format: 'superoutride.course',
    version: 52,
    name: options.name,
    entry: cuts[0]!.id,
    maxLaps: 1,
    bearing: 0,
    sections,
    links: cuts.slice(1).map(({ id }, k) => ({
      id: `${cuts[k]!.id}-${id}`,
      from: { section: cuts[k]!.id, lane: 'b' },
      to: id,
    })),
  };
  return { document, profile: road.profile, crossings: road.crossings, objects: road.objects };
}

/** The stages raised as courses: their course IDs, names, Sections, skies and runouts (positions on the look-ahead). */
export const OUTRUN_COURSES = Object.freeze([
  {
    id: 'outrun-coconut-beach',
    stage: 0x3c,
    name: 'COCONUT BEACH',
    // The game's first stage: the objects standing at its start are its.
    start: true,
    // The plan passes over itself, the stage's end over its curve at 795: the Sections part between the passages.
    sections: [
      { id: 'coconut-beach-1', from: 0 },
      { id: 'coconut-beach-2', from: 1243 },
    ],
    runout: 225,
    sky: { image: 'coast-sky', horizonY: 320 },
  },
] as const);
