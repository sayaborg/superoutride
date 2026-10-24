/**
 * OUTRUN's roads ([OUTRUN road data](../../docs/outrun-road-data.md#outruns-roads)): pieces laid one after another
 * as one LINEAR course each. Each span is laid on its road path P, the plan from its heading table, and in the world
 * after the one before; the
 * road's crossings are kept apart and its passages over itself parted into Sections; its objects stand along the whole
 * road; each Section is written with its lanes, verges, strips (the roads' surfaces, lines and edges as the original
 * draws two roads), objects, gates and skies.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { COURSE_DOCUMENT_VERSION } from '../../src/course/course-document.js';
import { OUTRUN_ROAD, ROAD_HALF, TOUCHING, UNIT_METRES } from './outrun-cross-section.js';
import { composite, type FeatureEdge } from './two-roads.js';
import { POSITION_METRES, STRIPE_PERIOD } from './offset-plan.js';
import { CoursePath, type Pose } from './course-path.js';
import { headingPlan, planFidelity, VECTOR_RESOLUTION, type PlanElement } from './heading-plan.js';
import { leastLaneRadius } from '../../src/course/plan-clearance.js';
import {
  forkSpan,
  joinSpan,
  rampLength,
  stageSpan,
  type DrawnRoad,
  type LaneRef,
  type Span,
  type VergeKnot,
  type GoalOptions,
  sliceSpan,
  GOAL_CENTRE,
  withEntry,
} from './outrun-pieces.js';
import {
  bendOf,
  closedGrades,
  crossingOf,
  LOOK,
  profileOf,
  sectionProfile,
  separatedCrossings,
  stageGrades,
  type Change,
  type Profile,
} from './road-profile.js';
import { tableRuns } from './hills.js';
import { PIXEL_ASPECT } from './pixel-grid.js';
import { SPRITE_SOURCE_TEXELS_PER_METER as TEXELS } from '../../src/image/sprite.js';
import {
  groundWidth,
  JOINT_SNAP,
  passagePairs,
  raisedSplit,
  repeated,
  simplified,
  writtenPlan,
} from './section-writing.js';
import type { Stage, Stretch } from './outrun-road.js';
import type { HeightTable, Path } from './road-tables.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import type { LyingBoard } from './outrun-boards.js';
import { lyingMaterials, type LyingPiece } from './ground-materials.js';
import { TEXT_MARKS } from '../../src/image/text-tiles.js';

/**
 * The start grid: as many slots as a run's competitors, this far apart, the last (the player's) at GO in lane b, where
 * the original's car stands (the width's first change carries its x from 0 to the left road's centre, 0xC286), the
 * others alternating c and b back from it.
 */
const GRID_SLOTS = 16;
const GRID_SPACING = 12;
/** Two passages of a road at least this far apart along it may cross. */
const PASSAGES_APART = 200;
/** One crossing's later passage moves by less than this from one of its earlier passage's positions to the next, metres. */
const CROSSING_REACH = 60;
/** A painted interval narrowing to nothing at a stretch's end is drawn to where it is this wide, metres. */
const THIN = 1e-5;
/** A width is there where it is wider than this, units. */
const THERE = 1e-9;
/** Where the composite of the roads is sampled for changes, positions. */
const SAMPLE = 0.25;
/** The guidance where a road is chosen, a default K decides on Pages (`roadGuidance`), metres. */
const GUIDANCE = Object.freeze({
  /** The signs stand this far before the roads part, beyond the edge band of the side not taken by `aside`. */
  signs: [500, 300, 150],
  aside: 2,
  /** The chevrons stand in the gap between the roads from where it is `apart` wide, `every` apart, `count` of them. */
  apart: 2,
  every: 15,
  count: 3,
  /** Across the road not taken this many positions before its end. */
  deadEnd: 1,
  /** Road arrows in each lane not taken at least `lane` wide, from `before` the parting to `short` of the dead end. */
  arrows: { before: 150, short: 10, every: 25, lane: 2.5, width: 2.4, length: 12 },
  /** The arrows' color, the lines' white on most stages (on DESERT and WILDERNESS the lines are the surface's). */
  white: 31710,
});

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
const metres = (units: number) => round(units * UNIT_METRES);
/** The metres along P to position `p`: P is the plan, a position `POSITION_METRES` along it. */
const along = (p: number) => p * POSITION_METRES;

/** A span of a road: what it is, and the lanes its Link leaves by. */
export interface RoadSpan {
  readonly span: Span;
  /** Its Sections' ids' stem. */
  readonly id: string;
  /** The lane its last Section's Link leaves by, toward the next span. */
  readonly leaves: string;
  /** Whether it begins its stage (at GO), not a fork's. */
  readonly starts: boolean;
}

/** A span laid: P, its plan, its pose in the world, its Sections' cuts and their road stations. */
export interface Laid {
  readonly road: RoadSpan;
  /** P from the span's start, its plan's elements. */
  readonly line: CoursePath;
  /** The plan from its heading table, and its fidelity to the table (`planFidelity`). */
  readonly plan: {
    readonly elements: readonly PlanElement[];
    readonly fidelity: ReturnType<typeof planFidelity>;
  };
  /** Its frame in the world: a point of its frame `p` is at `rotate(p) + origin`. */
  readonly world: { readonly x: number; readonly y: number; readonly heading: number };
  readonly cuts: readonly number[];
  /** Each Section's start's road station: the lengths of the Sections before it as written. */
  readonly origins: readonly number[];
}

/** The road station of position `p` of span `l`: its Section's start's, and the metres along P from there. */
export function stationOf(l: Pick<Laid, 'cuts' | 'origins'>, p: number) {
  const i = l.cuts.filter((c) => c <= p).length;
  return l.origins[i]! + along(p - (i ? l.cuts[i - 1]! : 0));
}

/** The length of a Section of P `line` over positions `[from, to]`, as written. */
const writtenLength = (line: CoursePath, from: number, to: number) =>
  writtenPlan(line, { from: along(from), to: along(to) }).reduce((sum, e) => sum + e.length, 0);

/** Lane lines at a position: each lane's or median's left and right edge, units right of the centreline. */
const laneLines = (span: Span, p: number) => laneLinesOf(span, span.lanes(p));
/** Lane lines of lane widths `widths` (units), the centre lane's centre at 0. */
function laneLinesOf(span: Span, widths: ReadonlyMap<string, number>) {
  const order = span.order;
  const k = order.indexOf(span.centreLane);
  const lines = new Map<string, { left: number; right: number }>();
  let x = -widths.get(span.centreLane)! / 2;
  for (let i = k; i >= 0; i--) {
    const w = widths.get(order[i]!)!;
    if (i < k) x -= w;
    lines.set(order[i]!, { left: x, right: x + w });
  }
  x = widths.get(span.centreLane)! / 2;
  for (let i = k + 1; i < order.length; i++) {
    const w = widths.get(order[i]!)!;
    lines.set(order[i]!, { left: x, right: x + w });
    x += w;
  }
  return lines;
}
/** Where `ref` lies at `p`, units right of the centreline. */
const lineOf = (span: Span, ref: LaneRef, p: number) => laneLines(span, p).get(ref.lane)![ref.side] + ref.units;

/** The roads drawn at `p`, left to right. */
const drawnAt = (span: Span, p: number) =>
  span.roads
    .map((road, index) => ({ road, index }))
    .filter(({ road }) => p >= road.from && p < road.to)
    .sort((a, b) => lineOf(span, a.road.centre, p) - lineOf(span, b.road.centre, p));

/** A verge knot's lateral at `p`, metres right of the centreline: the ground's width `beyond` its lane edge. */
const vergeLateral = (span: Span, k: VergeKnot, p: number, beyond: number) =>
  lineOf(span, k.ref, p) * UNIT_METRES + k.outward * beyond;

/**
 * The verge's knots with their ramps placed, the ground `beyond` the lanes: each NaN knot a ramp's length from the knot
 * whose road it ramps to.
 */
function placedVerges(span: Span, knots: readonly VergeKnot[], beyond: number): VergeKnot[] {
  const lateral = (k: VergeKnot, p: number) => vergeLateral(span, k, p, beyond);
  return knots.map((k, i) => {
    if (!Number.isNaN(k.at)) return k;
    const [before, after] = [knots[i - 1]!, knots[i + 1]!];
    if (JSON.stringify(before.ref) !== JSON.stringify(k.ref))
      return { ...k, at: before.at + rampLength(lateral(k, before.at) - lateral(before, before.at)) / POSITION_METRES };
    return { ...k, at: after.at - rampLength(lateral(after, after.at) - lateral(k, after.at)) / POSITION_METRES };
  });
}

/** A verge's lateral at position `p`, metres right of P: its knots' lines straight between them. */
function vergeLine(span: Span, knots: readonly VergeKnot[], beyond: number) {
  const placed = placedVerges(span, knots, beyond);
  const lateral = (k: VergeKnot, p: number) => vergeLateral(span, k, p, beyond);
  return (p: number) => {
    const i = Math.max(
      1,
      Math.min(
        placed.length - 1,
        placed.findIndex((k) => k.at >= p),
      ),
    );
    const [a, b] = [placed[i - 1]!, placed[i]!];
    const t = Math.max(0, Math.min(1, (p - a.at) / (b.at - a.at || 1)));
    return span.offset.at(p) + lateral(a, p) + (lateral(b, p) - lateral(a, p)) * t;
  };
}

/** A span's asphalt across, metres left and right of P: its drawn roads' outermost surfaces. */
function asphaltAt(span: Span, p: number): [number, number] {
  const centres = drawnAt(span, Math.min(p, span.length - 1e-9)).map(({ road }) => lineOf(span, road.centre, p));
  const offset = span.offset.at(p);
  return [
    (-Math.min(...centres) + ROAD_HALF) * UNIT_METRES - offset,
    (Math.max(...centres) + ROAD_HALF) * UNIT_METRES + offset,
  ];
}

/** A point `pose` frame `world` puts in the world. */
const toWorld = (world: Laid['world'], pose: Pose): Pose => {
  const [c, s] = [Math.cos(world.heading), Math.sin(world.heading)];
  return {
    x: world.x + c * pose.x - s * pose.y,
    y: world.y + s * pose.x + c * pose.y,
    heading: pose.heading + world.heading,
  };
};
/** The point `lateral` metres right of `pose`. */
const aside = (pose: Pose, lateral: number): Pose => ({
  x: pose.x + lateral * Math.sin(pose.heading),
  y: pose.y - lateral * Math.cos(pose.heading),
  heading: pose.heading,
});

/** Whether two convex polygons overlap: no edge of either separates them. */
function overlap(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!,
        [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const [nx, ny] = [y0 - y1, x1 - x0];
      const span = (q: readonly (readonly [number, number])[]) => q.map(([x, y]) => nx * x + ny * y);
      const [pa, pb] = [span(a), span(b)];
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

/**
 * Where a road passes over itself: pairs of road stations at least 200 m apart whose cross-sections (each span's
 * `sides(span, p)`, metres left and right of P) overlap between a position and the next; each crossing's pairs grouped
 * where their earlier stations run on.
 */
function roadCrossings(
  laid: readonly Pick<Laid, 'road' | 'line' | 'world' | 'cuts' | 'origins'>[],
  sides: (span: Span, p: number) => [number, number],
) {
  const cells: { points: [number, number][]; at: number }[] = [];
  laid.forEach((l) => {
    const corners = Array.from({ length: Math.floor(l.road.span.length) + 1 }, (_, i) => {
      const p = Math.min(i, l.road.span.length);
      const pose = toWorld(l.world, l.line.pose(along(p)));
      const [left, right] = sides(l.road.span, p);
      const [a, b] = [aside(pose, -left), aside(pose, right)];
      return {
        at: stationOf(l, p),
        points: [
          [a.x, a.y],
          [b.x, b.y],
        ] as [number, number][],
      };
    });
    for (let i = 0; i + 1 < corners.length; i++)
      cells.push({
        points: [
          corners[i]!.points[0]!,
          corners[i]!.points[1]!,
          corners[i + 1]!.points[1]!,
          corners[i + 1]!.points[0]!,
        ],
        at: corners[i]!.at,
      });
  });
  const SQUARE = 50;
  const squares = (cell: { points: [number, number][] }) => {
    const xs = cell.points.map(([x]) => Math.floor(x / SQUARE)),
      ys = cell.points.map(([, y]) => Math.floor(y / SQUARE));
    const keys: string[] = [];
    for (let i = Math.min(...xs); i <= Math.max(...xs); i++)
      for (let j = Math.min(...ys); j <= Math.max(...ys); j++) keys.push(`${i},${j}`);
    return keys;
  };
  const grid = new Map<string, number[]>();
  cells.forEach((cell, i) => {
    for (const key of squares(cell)) grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const groups: [number, number][][] = [];
  cells.forEach((cell) => {
    const near = new Set(
      squares(cell).flatMap((key) => grid.get(key)!.filter((j) => cells[j]!.at >= cell.at + PASSAGES_APART)),
    );
    for (const j of [...near].sort((a, b) => a - b)) {
      if (!overlap(cell.points, cells[j]!.points)) continue;
      // The crossing this pair runs on: its earlier passage a position or two on, its later one near.
      const pair: [number, number] = [cell.at, cells[j]!.at];
      const group = groups.find(
        (g) => cell.at - g.at(-1)![0] <= 2 * POSITION_METRES && Math.abs(pair[1] - g.at(-1)![1]) < CROSSING_REACH,
      );
      if (group) group.push(pair);
      else groups.push([pair]);
    }
  });
  return groups;
}

/** What a road's course takes beside its spans. */
export interface RoadOptions {
  readonly id: string;
  /** The pictures of what lies on the ground, by image name: their materials lie beneath the objects showing them. */
  readonly lying: ReadonlyMap<string, LyingBoard>;
  /** Each extending board's edge, by its image name: standing once where the board does. */
  readonly edges: ReadonlyMap<string, string>;
  /** Each picture's width, metres, by image name. */
  readonly widths: ReadonlyMap<string, number>;
  /** The pictures standing at their foot shown raised too, by their `-raised` image. */
  readonly split: ReadonlySet<string>;
  readonly name: string;
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  /**
   * The camera's distance behind the car: the road's entry is this far before GO, where the car stands at road position
   * 0, the camera at the entry.
   */
  readonly cameraDistance: number;
  /**
   * The road's objects, by road position from the entry: given GO's, the road width (units) at each, where each
   * stretch the original runs ends, and the road's end; with where each checkpoint banner passes the car, and what the
   * placing reports.
   */
  readonly objects: (
    points: readonly {
      readonly position: number;
      readonly count: number;
      readonly type: number;
      readonly passable: boolean;
    }[],
    road: {
      readonly go: number;
      readonly width: (position: number) => number;
      readonly resets: readonly number[];
      readonly end: number;
      /** Where each goal stretch begins, and its goal's number. */
      readonly goals: readonly { readonly position: number; readonly number: number }[];
    },
  ) => {
    readonly placements: readonly ObjectPlacement[];
    readonly checkpoints: readonly number[];
    readonly report: unknown;
  };
  /** Each stage's sky image and its horizon row. */
  readonly sky: (stage: Stage) => { readonly image: string; readonly horizonY: number };
  /** Each stage's name and its Sections' ids' stem. */
  readonly stageName: (stage: Stage) => string;
}

/** How far a span's lanes reach from P at `p` on `side`, metres: to its outermost lane's edge there. */
function laneReach(span: Span, p: number, side: 'left' | 'right') {
  const widths = span.lanes(p);
  const edges = [...laneLines(span, p)].filter(([id]) => widths.get(id)! > 0).map(([, line]) => line);
  const units = side === 'left' ? -Math.min(...edges.map((l) => l.left)) : Math.max(...edges.map((l) => l.right));
  return units * UNIT_METRES + (side === 'left' ? -1 : 1) * span.offset.at(p);
}

/** A span laid on P: the plan from its heading table, and its Sections' cuts. */
function laySpan(road: RoadSpan) {
  const { span } = road;
  // The plan, its turns no tighter than its lanes keep.
  const least = (from: number, to: number, side: 'left' | 'right') =>
    leastLaneRadius(
      Math.max(
        ...[from, to, ...Array.from({ length: Math.ceil(to - from) }, (_, k) => from + k), ...span.width.breaks]
          .filter((p) => p >= from && p <= to && p < span.length)
          .map((p) => laneReach(span, p, side)),
      ),
    );
  const plan = headingPlan(span.headings, VECTOR_RESOLUTION, POSITION_METRES, least);
  const line = new CoursePath(
    plan.elements.map((e) => ({ start: along(e.from), length: along(e.to - e.from), turn: e.turn })),
    0,
  );
  // The least radius a side's lanes keep, `u` metres along P.
  const need = (u: number, side: 'left' | 'right') =>
    leastLaneRadius(laneReach(span, Math.min(u / POSITION_METRES, span.length - 1e-9), side));
  return {
    line,
    plan: {
      elements: plan.elements,
      fidelity: planFidelity(
        span.headings,
        plan.elements,
        plan.start,
        POSITION_METRES,
        VECTOR_RESOLUTION,
        plan.widened,
      ),
    },
    cuts: spanCuts(road, line, need),
  };
}

/**
 * Where a span's road comes near itself (`passagePairs`, its lanes' `need` either side), its passages parted: a cut at
 * the last joint before the later passage, after the earlier, where the road is one (its width at most 212).
 */
function spanCuts(road: RoadSpan, line: CoursePath, need: (u: number, side: 'left' | 'right') => number): number[] {
  const cuts: number[] = [];
  for (const [a, b] of passagePairs(line, 0, line.length, need, POSITION_METRES)) {
    if (cuts.some((c) => a < along(c) && along(c) <= b)) continue;
    const joints = line.elements
      .map((e) => e.start / POSITION_METRES)
      .filter((p) => p > 0 && a < along(p) && along(p) <= b && road.span.width.at(p) <= TOUCHING);
    requireInput(
      joints.length > 0,
      `/${road.id}`,
      `No joint where the road is one parts ${road.id}'s passages at ${a} m`,
    );
    cuts.push(joints.at(-1)!);
    cuts.sort((x, y) => x - y);
  }
  return cuts;
}

/** Each span laid on P, and in the world after the one before, its Link's lane continuing as its centre lane. */
export function layRoad(spans: readonly RoadSpan[]): Laid[] {
  const laid: Laid[] = [];
  let station = 0;
  for (const road of spans) {
    const { line, plan, cuts } = laySpan(road);
    const before = laid.at(-1);
    let world = { x: 0, y: 0, heading: 0 };
    if (before) {
      const end = before.road.span.length;
      const pose = toWorld(before.world, before.line.pose(along(end)));
      const ref = { lane: before.road.leaves, side: 'left' as const, units: 0 };
      const leaves =
        before.road.span.offset.at(end) +
        (lineOf(before.road.span, ref, end) + before.road.span.lanes(end).get(before.road.leaves)! / 2) * UNIT_METRES;
      const at = aside(pose, leaves);
      // The span's centre lane's centre at its start, on its frame.
      const first = aside(line.pose(0), road.span.offset.at(0));
      const heading = at.heading - first.heading;
      const [c, s] = [Math.cos(heading), Math.sin(heading)];
      world = { x: at.x - (c * first.x - s * first.y), y: at.y - (s * first.x + c * first.y), heading };
    }
    const ends = [...cuts, road.span.length];
    const origins = ends.map((to, i) => {
      const origin = station;
      station += writtenLength(line, i ? ends[i - 1]! : 0, to);
      return origin;
    });
    laid.push({ road, line, plan, world, cuts, origins });
  }
  return laid;
}

/**
 * A laid road's profile, by road station: each piece's tables run and their grades returned, the piece closed level at
 * 0 at its ends; the road's crossings kept apart; bends broken at its Sections' cuts. With its end and its crossings.
 */
export function roadProfile(
  laid: readonly Laid[],
  options: { readonly tables: ReadonlyMap<number, HeightTable>; readonly kmh: number },
) {
  const last = laid.at(-1)!;
  const end = last.origins.at(-1)! + writtenLength(last.line, last.cuts.at(-1) ?? 0, last.road.span.length);
  // A road position's station: a piece may run on past its span's end into the next.
  const starts = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  const stationAt = (position: number) => {
    const k = Math.max(0, starts.filter((p) => p <= position).length - 1);
    const l = laid[k]!;
    return stationOf(l, Math.min(position - starts[k]!, l.road.span.length));
  };
  const changes: Change[] = laid.flatMap((l, k) =>
    l.road.span.heights.flatMap((piece) => {
      const from = starts[k]! + piece.from;
      const origin = stationAt(from);
      const stationOf = (p: number) => stationAt(from + p) - origin;
      const runs = tableRuns(piece.points, options.tables, () => options.kmh);
      const length = stationAt(starts[k]! + piece.to) - origin;
      const own = closedGrades(stageGrades(runs, LOOK, stationOf, stationOf(piece.cut - piece.from), length), length);
      return own.map((c) => ({ ...c, from: c.from + origin, to: c.to + origin }));
    }),
  );
  const crossings = roadCrossings(laid, (span, p) => asphaltAt(span, p));
  const cutStations = laid.flatMap((l) => l.origins).slice(1);
  const profile = profileOf(
    separatedCrossings(changes, crossings.map(crossingOf), end)
      .changes.filter((c) => c.from >= 0 && c.to <= end)
      .map(bendOf),
    cutStations,
  );
  return { end, profile, crossings };
}

/**
 * One road as a course document, its Positions still measured from each Section's first joint, and what it reports:
 * spans in order, the first the entry, each joined to the next by its `leaves` lane. The first span's start is the
 * grid's; a stage reached through a fork or a join has its checkpoint where its banner passes the car; a stage
 * ending in a goal has a checkpoint at its end where the road runs on, the last stage its finish. Its height tables run per piece, each closed level at 0; its crossings are kept 6 m apart; where
 * a span's coordinate domain passes over itself, a cut where the road is one parts its passages.
 */
export function outrunRoad(spans: readonly RoadSpan[], options: RoadOptions) {
  // The road's entry: the camera's distance before GO, where the camera stands.
  const go = options.cameraDistance / POSITION_METRES;
  const laid = layRoad([{ ...spans[0]!, span: withEntry(spans[0]!.span, go) }, ...spans.slice(1)]);
  const { end, profile, crossings } = roadProfile(laid, options);

  // The objects along the whole road, by road position.
  const positions = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  const spanAt = (position: number) => {
    const k = Math.max(0, positions.filter((p) => p <= position).length - 1);
    return { k, p: Math.min(position - positions[k]!, laid[k]!.road.span.length) };
  };
  const roadEnd = positions.at(-1)! + laid.at(-1)!.road.span.length;
  const objects = options.objects(
    // A goal's own objects, where the road runs on through them, are passed through (K, 2026-10-20, for now).
    laid.flatMap((l, k) => {
      const goal = l.road.span.stageEnd;
      return l.road.span.scenery.map((p) => ({
        ...p,
        position: p.position + positions[k]!,
        passable: goal !== undefined && p.position >= goal && k < laid.length - 1,
      }));
    }),
    {
      go,
      width: (position) => {
        const { k, p } = spanAt(position);
        return laid[k]!.road.span.width.at(p);
      },
      resets: laid.flatMap((l, k) => l.road.span.resets.map((r) => positions[k]! + r)),
      end: roadEnd,
      goals: laid.flatMap((l, k) => {
        const goal = l.road.span.goal;
        return goal ? [{ position: positions[k]! + goal.at, number: goal.number }] : [];
      }),
    },
  );
  const placed = objects.placements.flatMap((o) => {
    const { k, p } = spanAt(o.position);
    const l = laid[k]!;
    // Its point in the world: the original's x from its middle at its position, across from P there.
    const base = l.line.pose(along(p));
    const across = (l.road.span.middle(p) + o.x) * UNIT_METRES;
    const point = toWorld(l.world, aside(base, across));
    const found = project(laid, k, point, p);
    return found ? [{ ...found, object: o }] : [];
  });
  // How far the objects shown on the ground reach beyond the outermost lanes, an extending board's edge with it.
  const beyond = groundWidth(
    placed
      .filter(({ object: o }) => o.y === 0)
      .flatMap(({ k, p, lateral, object: o }) => {
        const span = laid[k]!.road.span;
        const q = Math.min(p, span.length - 1e-9);
        const edges = [laneReach(span, q, 'left'), laneReach(span, q, 'right')] as const;
        const edge = options.edges.get(o.image);
        return [o.image, ...(edge ? [edge] : [])].map((image) => ({
          lateral,
          width: options.widths.get(image)!,
          edges,
        }));
      }),
  );

  const guidance = roadGuidance(laid);

  // The Sections, SAND reaching `ground` beyond the outermost lanes.
  // Each stage's sky faces as at its start, its GO: where the span that begins it begins.
  const stageStarts = new Map<Stage, number>();
  for (const l of laid)
    if (l.road.starts) stageStarts.set(l.road.span.stages[0]!.stage, l.world.heading + l.line.pose(0).heading);
  const checkpoints = objects.checkpoints.map((position) => {
    const { k, p } = spanAt(position);
    return { k, p };
  });
  const write = (ground: number) => {
    const sections: unknown[] = [];
    const links: { id: string; from: { section: string; lane: string }; to: string }[] = [];
    laid.forEach((l, k) => {
      const starts = [0, ...l.cuts];
      const ids = starts.map((_, i) => (i === 0 ? l.road.id : `${l.road.id}-${i + 1}`));
      starts.forEach((from, i) => {
        const to = starts[i + 1] ?? l.road.span.length;
        const last = k === laid.length - 1 && i === starts.length - 1;
        const name = options.stageName(l.road.span.stages[0]!.stage).toUpperCase();
        const cp = checkpoints.find((c) => c.k === k && c.p > from && c.p <= to);
        // A stage's end is the road's finish on its last span, else a checkpoint: a goal the road runs on from.
        const end = l.road.span.stageEnd;
        const goal = end !== undefined && end > from && end <= to ? { id: `${name}-GOAL`, p: end } : null;
        sections.push(
          sectionDocument(l, {
            id: ids[i]!,
            from,
            to,
            roadOrigin: l.origins[i]!,
            first: k === 0 && i === 0,
            joinsBefore: k > 0 || i > 0,
            joinsAfter: !last,
            checkpoints: [
              ...(cp ? [{ id: `${name}-CP`, p: cp.p }] : []),
              ...(goal && k < laid.length - 1 ? [goal] : []),
            ],
            finish: k === laid.length - 1 ? goal : null,
            objects: placed.filter((o) => o.k === k && o.p >= from && o.p < to),
            guidance: guidance.filter((g) => g.k === k && g.p >= from && g.p < to),
            profile,
            stageStarts,
            ground,
            options,
          }),
        );
        const next = starts[i + 1] !== undefined ? ids[i + 1] : laid[k + 1]?.road.id;
        if (next)
          links.push({
            id: `${ids[i]}-${next}`,
            from: { section: ids[i]!, lane: starts[i + 1] !== undefined ? l.road.span.centreLane : l.road.leaves },
            to: next,
          });
      });
    });
    return {
      format: 'superoutride.course',
      version: COURSE_DOCUMENT_VERSION,
      name: options.name,
      entry: laid[0]!.road.id,
      maxLaps: 1,
      bearing: 0,
      sections,
      links,
    };
  };
  return {
    /** The road's document, SAND reaching `ground` beyond the lanes (the original's; `beyond`, this road's most). */
    write,
    laid,
    end,
    profile,
    crossings,
    objects: placed.length,
    beyond,
    placing: objects.report,
    fidelity: laid.map((l) => ({ span: l.road.id, ...l.plan.fidelity })),
  };
}

/** The position and lateral `point` (world) stands at on a span's P, near position `p` of span `k` or its neighbours. */
function project(laid: readonly Laid[], k: number, point: Pose, p: number) {
  for (const j of [k, k + 1, k - 1]) {
    const l = laid[j];
    if (!l) continue;
    const [c, s] = [Math.cos(-l.world.heading), Math.sin(-l.world.heading)];
    const [dx, dy] = [point.x - l.world.x, point.y - l.world.y];
    const local = { x: c * dx - s * dy, y: s * dx + c * dy };
    let q = j === k ? p : j > k ? 0 : l.road.span.length;
    for (let i = 0; i < 30; i++) {
      const pose = l.line.pose(along(Math.min(Math.max(q, 0), l.road.span.length)));
      const step =
        ((local.x - pose.x) * Math.cos(pose.heading) + (local.y - pose.y) * Math.sin(pose.heading)) / POSITION_METRES;
      q += step;
      if (Math.abs(step) < 1e-9) break;
    }
    if (q < 0 || q > l.road.span.length) continue;
    const pose = l.line.pose(along(q));
    const lateral = (local.x - pose.x) * Math.sin(pose.heading) - (local.y - pose.y) * Math.cos(pose.heading);
    return { k: j, p: q, lateral };
  }
  return null;
}

/** A piece of guidance at position `p` of span `k`: a road arrow in a lane, or a board beside a lane's side. */
type Guide = { readonly k: number; readonly p: number } & (
  | { readonly kind: 'arrow'; readonly lane: string; readonly direction: 'left' | 'right' }
  | {
      readonly kind: 'sign';
      readonly image: string;
      readonly lane: string;
      readonly side: 'left' | 'center' | 'right';
      readonly offset: number;
    }
);

/**
 * The guidance where a road is chosen (each fork, and each goal the road runs on from), all passed through: `route-arrow`
 * boards before the roads part, beyond the edge band of the side not taken; `route-chevron` boards in the gap between
 * the roads from where it is 2 m wide, and across the road not taken just before its end; and road arrows in the lanes
 * not taken, toward the road taken, from before the parting to just short of the dead end. Each points to the road
 * taken.
 */
function roadGuidance(laid: readonly Laid[]): Guide[] {
  // A road station's span and position.
  const positionAt = (station: number) => {
    const k = laid.reduce((found, l, i) => (l.origins[0]! <= station ? i : found), 0);
    const l = laid[k]!;
    const i = l.origins.filter((o) => o <= station).length - 1;
    const from = i > 0 ? l.cuts[i - 1]! : 0;
    return {
      k,
      p: Math.max(0, Math.min(l.road.span.length, from + (station - l.origins[Math.max(0, i)]!) / POSITION_METRES)),
    };
  };
  return laid.flatMap((l, k) => {
    const choice = l.road.span.choice;
    if (!choice || k === laid.length - 1) return [];
    const { span } = l.road;
    const station = (p: number) => stationOf(l, p);
    const toward: 'left' | 'right' = choice.side < 0 ? 'left' : 'right';
    const away = choice.side < 0 ? 'right' : 'left';
    const board = (
      at: { k: number; p: number },
      name: string,
      lane: string,
      side: 'left' | 'center' | 'right',
      offset: number,
    ) => ({ kind: 'sign' as const, ...at, image: `${name}-${toward}`, lane, side, offset });
    // The signs, beyond the edge band of the side not taken: its outer lane's edge, the asphalt beyond it, and more.
    const outer = choice.side < 0 ? choice.dead.at(-1)! : choice.dead[0]!;
    const beyond = ((ROAD_HALF - TOUCHING) * UNIT_METRES + GUIDANCE.aside) * (choice.side < 0 ? 1 : -1);
    const signs = GUIDANCE.signs.map((before) =>
      board(positionAt(station(choice.parts) - before), 'route-arrow', outer, away, beyond),
    );
    // The gap between the roads: the asphalt between the road taken and the road not taken.
    const gap = (p: number) => 2 * (span.width.at(p) - ROAD_HALF) * UNIT_METRES;
    let [lo, hi] = [choice.parts, choice.ends];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (gap(mid) < GUIDANCE.apart) lo = mid;
      else hi = mid;
    }
    const inner = choice.side < 0 ? choice.taken.at(-1)! : choice.taken[0]!;
    const chevrons = Array.from({ length: GUIDANCE.count }, (_, i) => {
      const at = positionAt(station(hi) + i * GUIDANCE.every);
      // The gap's middle: half the median beside the road taken's inner lane, toward the road not taken.
      const there = laid[at.k]!.road.span;
      const median = there.lanes(at.p).get(there.order[there.order.indexOf(inner) - choice.side]!)!;
      return board(at, 'route-chevron', inner, away, (-choice.side * median * UNIT_METRES) / 2);
    });
    const deadEnd = choice.dead.map((lane) =>
      board({ k, p: choice.ends - GUIDANCE.deadEnd }, 'route-chevron', lane, 'center', 0),
    );
    const { before, short, every, lane: wide } = GUIDANCE.arrows;
    const [from, to] = [station(choice.parts) - before, station(choice.ends) - short];
    const arrows = Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) =>
      positionAt(from + i * every),
    ).flatMap((at) => {
      const widths = laid[at.k]!.road.span.lanes(at.p);
      return choice.dead
        .filter((lane) => (widths.get(lane) ?? 0) * UNIT_METRES >= wide)
        .map((lane) => ({ kind: 'arrow' as const, ...at, lane, direction: toward }));
    });
    return [...signs, ...chevrons, ...deadEnd, ...arrows];
  });
}

type Lateral = Record<string, unknown> | number;
const laneLateral = (lane: string, side: string, offset: number): Lateral => ({ lane, side, offset: round(offset) });
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** One Section of a laid span, `[from, to]` its positions. */
function sectionDocument(
  l: Laid,
  section: {
    readonly id: string;
    readonly from: number;
    readonly to: number;
    /** Its start's road station. */
    readonly roadOrigin: number;
    readonly first: boolean;
    readonly joinsBefore: boolean;
    readonly joinsAfter: boolean;
    readonly checkpoints: readonly { readonly id: string; readonly p: number }[];
    readonly finish: { readonly id: string; readonly p: number } | null;
    readonly objects: readonly { readonly p: number; readonly lateral: number; readonly object: ObjectPlacement }[];
    readonly guidance: readonly Guide[];
    readonly profile: Profile;
    readonly stageStarts: ReadonlyMap<Stage, number>;
    /** How far SAND reaches beyond the outermost lanes, metres. */
    readonly ground: number;
    readonly options: RoadOptions;
  },
) {
  const { span } = l.road;
  const { line } = l;
  const { from, to } = section;
  const origin = along(from);
  const { roadOrigin } = section;
  /** The station of position `p` from the Section's start. */
  const local = (p: number) => along(p) - origin;

  // The plan: P's elements over [from, to], as written; the Section's length theirs.
  const elements = writtenPlan(line, { from: along(from), to: along(to) });
  const size = round(elements.reduce((sum, e) => sum + e.length, 0));
  const first = elements[0]!.id;
  // A station within a few micrometres of a joint is the joint's: a position reckoned apart from the plan's elements
  // can round to the micrometre beside it.
  const joints = elements.map((_, i) => round(elements.slice(0, i).reduce((sum, e) => sum + e.length, 0)));
  const onJoint = (s: number) => joints.find((j) => Math.abs(j - s) <= JOINT_SNAP) ?? s;
  const atStation = (s: number) => {
    const offset = onJoint(round(s));
    return { joint: first, offset: offset > size - 1e-5 ? size : Math.max(0, offset) };
  };
  const at = (p: number) => atStation(local(p));

  // The lanes and the centre lane's centre at each knot, where a width, the centre lane's centre or a lane changes
  // slope, straight between; a lane or median 0 throughout left out.
  const knots = [
    ...new Set([
      from,
      to,
      ...span.width.breaks,
      ...span.offset.breaks,
      ...span.laneBreaks,
      ...span.roads.flatMap((r) => [r.from, r.to]),
    ]),
  ]
    .filter((p) => p >= from && p <= to)
    .sort((a, b) => a - b);
  const widths = knots.map((p) => span.lanes(p));
  const present = span.order.filter((name) => widths.some((w) => w.get(name)! > THERE));
  const lineOfValues = (values: [number, number][], name: 'width' | 'lateral') => {
    const simple = simplified(values);
    return simple.every(([, v]) => v === simple[0]![1])
      ? simple[0]![1]
      : simple.map(([s, v]) => ({ at: atStation(s), [name]: v }));
  };
  const lanes = present.map((name) => {
    const width = lineOfValues(
      knots.map((p, i) => [round(local(p)), metres(widths[i]!.get(name)!)]),
      'width',
    );
    return name.startsWith('m') ? { kind: 'median', width } : { kind: 'lane', id: name, width };
  });
  const centerLateral = lineOfValues(
    knots.map((p) => [round(local(p)), round(span.offset.at(p))]),
    'lateral',
  );
  // The lanes' lines as written: each width straight between its knots, as it is.
  const written = (p: number) => laneLines(span, p);
  const ref = (r: LaneRef, more = 0) => {
    requireInput(present.includes(r.lane), `/sections/${section.id}`, `Section ${section.id} has no lane ${r.lane}`);
    return laneLateral(r.lane, r.side, r.units * UNIT_METRES + more);
  };

  // The verges: knots within the Section, and its ends where a stretch of one reference holds.
  const verge = (knots: readonly VergeKnot[]) => {
    const placed = placedVerges(span, knots, section.ground);
    const inside = placed.filter((k) => k.at > from && k.at < to);
    const around = (p: number) => {
      const i = placed.findIndex((k) => k.at >= p);
      const [a, b] = [placed[Math.max(0, i - 1)]!, placed[Math.max(0, i)]!];
      const k = Math.abs(b.at - p) < 1e-9 ? b : Math.abs(a.at - p) < 1e-9 ? a : null;
      if (k) return k;
      requireInput(
        JSON.stringify(a.ref) === JSON.stringify(b.ref) && a.outward === b.outward,
        `/sections/${section.id}`,
        `Section ${section.id} is cut in a verge's ramp`,
      );
      return { ...a, at: p };
    };
    return [around(from), ...inside, around(to)].map((k) => ({
      at: at(k.at),
      lateral: ref(k.ref, k.outward * section.ground),
    }));
  };
  // A verge's lateral at a Section station, metres right of P.
  const vergeAt = (side: 'left' | 'right') => {
    const lateral = vergeLine(span, span.verges[side], section.ground);
    return (s: number) => lateral((s + origin) / POSITION_METRES);
  };

  // The strips.
  const { colors } = span.stages[0]!.stage;
  const ground = span.stages[0]!.stage.groundStripes;
  const surface = colors.surface.rgb555;
  const half = STRIPE_PERIOD / 2;
  const strip = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    color: number | null,
    material: string | null,
  ) => ({
    kind: 'strip',
    start: atStation(a),
    end: atStation(b),
    left,
    right,
    color,
    material,
  });
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO:
  // a part half where `a` falls in one, the whole halves as a repeat, a part half where `b` does.
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: number) => {
    const phase = h * half - (roadOrigin - section.options.cameraDistance);
    const first = phase + Math.ceil((a - phase) / STRIPE_PERIOD - 1e-9) * STRIPE_PERIOD;
    const pieces: unknown[] = [];
    if (first - STRIPE_PERIOD + half > a + 1e-6)
      pieces.push(strip(a, Math.min(b, first - STRIPE_PERIOD + half), left, right, color, null));
    const count = first + half <= b + 1e-9 ? Math.floor((b - first - half) / STRIPE_PERIOD + 1e-9) + 1 : 0;
    if (count > 0) {
      const element = strip(first, first + half, left, right, color, null);
      pieces.push(count === 1 ? element : { kind: 'repeat', every: round(STRIPE_PERIOD), count, elements: [element] });
    }
    const last = first + count * STRIPE_PERIOD;
    if (last < b - 1e-6) pieces.push(strip(last, b, left, right, color, null));
    return pieces;
  };
  const colored = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    two: readonly number[],
    under: readonly number[],
  ) => ([0, 1] as const).flatMap((h) => (two[h] === under[h] ? [] : halves(h, a, b, left, right, two[h]!)));
  const stations = (p: number) => round(local(p));
  const strips: unknown[] = [
    strip(0, size, null, null, ground[1], null),
    ...halves(0, 0, size, null, null, ground[0]),
    strip(0, size, boundary('outer-left'), boundary('outer-right'), null, 'SAND'),
  ];
  for (const road of span.roads) {
    const [a, b] = [Math.max(road.from, from), Math.min(road.to, to)];
    if (b <= a) continue;
    const [left, right] = [ref(road.centre, -ROAD_HALF * UNIT_METRES), ref(road.centre, ROAD_HALF * UNIT_METRES)];
    strips.push(strip(stations(a), stations(b), left, right, surface[1]!, 'ASPHALT'));
    if (surface[0] !== surface[1]) strips.push(...halves(0, stations(a), stations(b), left, right, surface[0]!));
  }
  // The lines and edge bands the roads' picture shows, a stretch of one arrangement at a time.
  for (const regime of regimes(span, from, to)) {
    for (const interval of regime.intervals) {
      const sideRef = (edge: FeatureEdge) => {
        const road = span.roads[edge.road]!;
        return { lane: road.centre.lane, side: road.centre.side, units: road.centre.units + edge.at };
      };
      const [lr, rr] = [sideRef(interval.left), sideRef(interval.right)];
      // Its width as the Section's lanes give it, straight between their knots; an end where it narrows to nothing
      // drawn in to where it is `THIN` wide.
      const width = (p: number) => {
        const lines = written(p);
        return (lines.get(rr.lane)![rr.side] + rr.units - lines.get(lr.lane)![lr.side] - lr.units) * UNIT_METRES;
      };
      const inward = (from: number, toward: number) => {
        if (width(from) >= THIN) return from;
        let [lo, hi] = [from, toward];
        if (width(hi) < THIN) return null;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          if (width(mid) >= THIN) hi = mid;
          else lo = mid;
        }
        return hi;
      };
      const mid = (regime.from + regime.to) / 2;
      const [a, b] = [inward(regime.from, mid), inward(regime.to, mid)];
      if (a === null || b === null || b - a < 1e-3) continue;
      const two = interval.paint === 'line' ? colors.laneLines.rgb555 : colors.edges.rgb555;
      strips.push(...colored(stations(a), stations(b), ref(lr), ref(rr), two, surface));
    }
  }

  // The road arrows.
  const { width: arrowWidth, length: arrowLength } = GUIDANCE.arrows;
  for (const g of section.guidance)
    if (g.kind === 'arrow')
      strips.push({
        kind: 'arrow',
        at: at(g.p),
        lateral: laneLateral(g.lane, 'center', 0),
        width: arrowWidth,
        length: arrowLength,
        direction: g.direction,
        color: GUIDANCE.white,
      });

  // What lies on the ground's materials, colorless beneath its boards: the sea's and lakes' `WATER` from the waterline
  // out to the verges; the sand drifts and the patches of sand on the road none.
  const lyingPieces: LyingPiece[] = [];
  for (const placed of section.objects) {
    const lying = section.options.lying.get(placed.object.image);
    if (!lying) continue;
    const { master } = lying;
    // A strip's pieces stand by their edge, a patch by its middle.
    const strip = master.extend !== undefined;
    lyingPieces.push({
      s: local(placed.p),
      l: placed.lateral,
      picture: lying,
      strip: strip ? { key: placed.object.image, outward: master.extend === 'right' ? 1 : -1 } : null,
      material: lying.material,
    });
  }
  const materials = lyingMaterials(lyingPieces, {
    length: size,
    outer: { left: { id: 'outer-left', at: vergeAt('left') }, right: { id: 'outer-right', at: vergeAt('right') } },
  });
  const edgeOf = (edge: string | number) => (typeof edge === 'string' ? boundary(edge) : round(edge));
  for (const g of materials.strips) {
    const [a, b] = [round(g.start), round(g.end)];
    if (b > a) strips.push(strip(a, b, edgeOf(g.left), edgeOf(g.right), null, g.material));
  }

  // The gates.
  const gates: unknown[] = [];
  if (section.first)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        // The last slot at GO, the camera's distance on from the road's entry.
        at: atStation(round(section.options.cameraDistance + (GRID_SLOTS - 1 - i) * GRID_SPACING)),
        lane: (GRID_SLOTS - 1 - i) % 2 ? 'c' : 'b',
      })),
      bikeGrid: null,
    });
  for (const c of section.checkpoints) gates.push({ kind: 'checkpoint', id: c.id, at: at(c.p) });
  if (section.finish) gates.push({ kind: 'finish', id: section.finish.id, at: at(section.finish.p) });

  // The skies: each stage's from where its stretch begins, facing as at its start.
  const heading = l.world.heading + line.pose(origin).heading;
  const environments = span.stages
    .filter((s, i) => (span.stages[i + 1]?.from ?? Infinity) > from && s.from < to)
    .map((s) => {
      const start = section.stageStarts.get(s.stage) ?? heading;
      return {
        // A sky the original changes changes where the car comes to it, the camera this game draws from behind it.
        at:
          s.from >= from && s.arrival === 'wipe'
            ? atStation(round(local(s.from) - section.options.cameraDistance))
            : at(Math.max(s.from, from)),
        name: section.options.stageName(s.stage),
        background: {
          ...section.options.sky(s.stage),
          yawOrigin: round(wrapDegrees(((heading - start) * 180) / Math.PI)),
        },
        arrival: s.from >= from ? s.arrival : 'cut',
      };
    });

  return {
    id: section.id,
    plan: elements,
    profile: sectionProfile(
      section.profile,
      roadOrigin,
      roadOrigin + size,
      section.joinsBefore,
      section.joinsAfter,
    ).map(({ s, y, curveLength }) => ({ at: { joint: first, offset: computedValue(s - roadOrigin) }, y, curveLength })),
    lanes,
    centerLane: span.centreLane,
    centerLateral,
    boundaries: [
      { id: 'outer-left', knots: verge(span.verges.left) },
      { id: 'outer-right', knots: verge(span.verges.right) },
      ...materials.boundaries.map(({ id, knots }) => ({
        id,
        knots: knots.map((k) => ({ at: atStation(k.s), lateral: round(k.l) })),
      })),
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: raisedSplit(
      repeated([
        ...section.objects.map(({ p, lateral, object: o }) => {
          const board = {
            kind: 'sprite',
            image: o.image,
            palette: o.palette,
            at: at(p),
            lateral: round(lateral),
            groundOffset: round(o.y * UNIT_METRES * PIXEL_ASPECT),
            unselectedLink: null,
            // As wide as its hit extents, at most its board's width in whole texels.
            body:
              o.hit === null
                ? null
                : {
                    width: round(Math.min(o.hit * UNIT_METRES, Math.round(o.width * UNIT_METRES * TEXELS) / TEXELS)),
                    movable: null,
                  },
          };
          // An extending board's edge stands once where it does, repeated with it.
          const edge = section.options.edges.get(o.image);
          return edge ? [board, { ...board, image: edge }] : board;
        }),
        // The guidance's signs, passed through.
        ...section.guidance.flatMap((g) =>
          g.kind === 'sign'
            ? [
                {
                  kind: 'sprite',
                  image: g.image,
                  palette: 'original',
                  at: at(g.p),
                  lateral: laneLateral(g.lane, g.side, g.offset),
                  groundOffset: 0,
                  unselectedLink: null,
                  body: null,
                },
              ]
            : [],
        ),
      ]),
      section.options.split,
    ),
    environments,
    gates,
  };
}

/**
 * The stretches of `[from, to]` over which the roads' picture keeps one arrangement: the same roads drawn, and the
 * same lines and edge bands, each between the same features. Found on a grid of `SAMPLE` positions, each change then
 * narrowed down by halving.
 */
function regimes(span: Span, from: number, to: number) {
  const pictureAt = (p: number) => {
    const drawn = drawnAt(span, p);
    const intervals = composite(
      drawn.map(({ road }) => lineOf(span, road.centre, p)),
      OUTRUN_ROAD,
    ).map((i) => ({
      paint: i.paint,
      left: { road: drawn[i.left.road]!.index, at: i.left.at },
      right: { road: drawn[i.right.road]!.index, at: i.right.at },
    }));
    return { key: JSON.stringify(intervals), intervals };
  };
  const bounds = [
    ...new Set([from, to, ...span.roads.flatMap((r: DrawnRoad) => [r.from, r.to]).filter((p) => p > from && p < to)]),
  ].sort((a, b) => a - b);
  const out: { from: number; to: number; intervals: ReturnType<typeof pictureAt>['intervals'] }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a, b] = [bounds[i]!, bounds[i + 1]!];
    const n = Math.max(1, Math.ceil((b - a) / SAMPLE));
    const mids = Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 0.5)) / n);
    let start = a,
      current = pictureAt(mids[0]!);
    for (let k = 1; k < n; k++) {
      const next = pictureAt(mids[k]!);
      if (next.key === current.key) continue;
      let [lo, hi] = [mids[k - 1]!, mids[k]!];
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        if (pictureAt(mid).key === current.key) lo = mid;
        else hi = mid;
      }
      out.push({ from: start, to: hi, intervals: current.intervals });
      [start, current] = [hi, next];
    }
    out.push({ from: start, to: b, intervals: current.intervals });
  }
  return out;
}

/** One of OUTRUN's roads: its course id and the side each fork takes. */
export interface OutrunRoute {
  readonly id: string;
  /** Each fork's side, left (L) or right (R), in order; on the road through all 15, then each join's. */
  readonly forks: string;
  /** Whether it runs through all 15 stages in the map's order, each goal but the last joining the next stage. */
  readonly all: boolean;
}
/** The six roads to the goals, each by its forks' sides, and the road through all 15, its sides alternating from L. */
export const OUTRUN_ROUTES: readonly OutrunRoute[] = Object.freeze([
  { id: 'outrun-a', forks: 'LLLL', all: false },
  { id: 'outrun-b', forks: 'LRLL', all: false },
  { id: 'outrun-c-left', forks: 'LLRR', all: false },
  { id: 'outrun-c-right', forks: 'RRLL', all: false },
  { id: 'outrun-d', forks: 'RLRR', all: false },
  { id: 'outrun-e', forks: 'RRRR', all: false },
  { id: 'outrun-all', forks: 'LRLRLRLRLRLRLR', all: true },
]);
/** A left fork leads up the original's map, a right one down. */
const FORK_MARKS: Readonly<Record<string, string>> = Object.freeze({ L: TEXT_MARKS.up, R: TEXT_MARKS.down });

/**
 * A road's name (K, 2026-10-20): its stages' short names in the order it runs them, each fork's side between them as
 * the map reads it (▲ left, up; ▼ right, down); the road through all 15, whose sides alternate only for the look,
 * ALL 15 STAGES.
 */
export function routeName(route: OutrunRoute, inputs: RouteInputs): string {
  if (route.all) return 'ALL 15 STAGES';
  return routeSteps(route, inputs)
    .map(({ stage }, k) => (k > 0 ? FORK_MARKS[route.forks[k - 1]!]! : '') + inputs.shortOf(stage))
    .join('');
}

/** What a route's spans are made from. */
export interface RouteInputs {
  /** The stage table's rows, each as the ROM lists it (its right fork's side first). */
  readonly rows: readonly (readonly number[])[];
  readonly stages: ReadonlyMap<number, Stage>;
  readonly fork: Stretch & { readonly path: Path };
  readonly goals: { readonly stretches: readonly Stretch[]; readonly path: Path };
  /** The goal stretch the stage at `row`, ROM `column` ends in. */
  readonly goalOf: (row: number, column: number) => number;
  /** A stage's Sections' ids' stem. */
  readonly idOf: (stage: Stage) => string;
  /** A stage's short name. */
  readonly shortOf: (stage: Stage) => string;
}

/**
 * A stage on a road, its goal if it is of the last row, and the next stage and the side it is reached by (a fork's, or
 * a join's after a goal), if there is one.
 */
interface Step {
  readonly stage: Stage;
  readonly goal: { readonly stretch: Stretch; readonly number: number } | null;
  readonly next: { readonly stage: Stage; readonly side: -1 | 1 } | null;
}

/**
 * A route's stages: from the first row's, each fork's side taken (left to the next row's stage at the same place counted
 * from the left, right to the one after it) to a last stage and its goal; or all 15 in the map's order, row by row and
 * within a row from the left, the forks' and joins' sides in turn.
 */
function routeSteps(route: OutrunRoute, inputs: RouteInputs): Step[] {
  const fromLeft = inputs.rows.map((row) => [...row].reverse());
  const last = inputs.rows.length - 1;
  const at = (r: number, c: number) => inputs.stages.get(fromLeft[r]![c]!)!;
  const goal = (r: number, c: number) => {
    if (r !== last) return null;
    const number = inputs.goalOf(r, fromLeft[r]!.length - 1 - c);
    return { stretch: inputs.goals.stretches[number]!, number };
  };
  const side = (k: number) => (route.forks[k] === 'L' ? -1 : 1);
  if (route.all) {
    const places = fromLeft.flatMap((row, r) => row.map((_, c) => [r, c] as const));
    return places.map(([r, c], k) => ({
      stage: at(r, c),
      goal: goal(r, c),
      next: places[k + 1] ? { stage: at(...places[k + 1]!), side: side(k) } : null,
    }));
  }
  const steps: Step[] = [];
  let column = 0;
  for (let r = 0; r <= last; r++) {
    const next = r < last ? column + (side(r) < 0 ? 0 : 1) : null;
    steps.push({
      stage: at(r, column),
      goal: goal(r, column),
      next: next === null ? null : { stage: at(r + 1, next), side: side(r) },
    });
    if (next !== null) column = next;
  }
  return steps;
}

/**
 * A route's spans: each stage of rows 1 to 4 and its fork piece's side taken, each last stage with its goal, and on the
 * road through all 15 each goal but the last followed by a join piece. A stage entered by a left side (L) has the road
 * taken as its right half (its centre lane e); by a right side (R), its left (b).
 */
export function routeSpans(route: OutrunRoute, inputs: RouteInputs): RoadSpan[] {
  const spans: RoadSpan[] = [];
  let centreLane: 'b' | 'e' = 'b';
  routeSteps(route, inputs).forEach(({ stage, goal, next }, k) => {
    const id = inputs.idOf(stage);
    const first = k === 0;
    // Each side leaves by its road taken's lane that continues as the next stage's centre lane: L's b as e, R's e as b
    // at a fork; L's e and R's b at a join.
    if (goal) {
      spans.push(...lastStageSpans(stage, { ...goal, path: inputs.goals.path }, first, centreLane, id));
      if (next) {
        const join = joinSpan(next.stage, next.side);
        spans.push({ span: join, id: `${id}-join`, leaves: join.centreLane, starts: false });
      }
    } else {
      const span = stageSpan(stage, { first, fork: inputs.fork, centreLane });
      spans.push({ span, id, leaves: next!.side < 0 ? 'b' : 'e', starts: true });
      const fork = forkSpan(inputs.fork, next!.side, stage, next!.stage);
      spans.push({
        span: fork,
        id: `${id}-${next!.side < 0 ? 'left' : 'right'}`,
        leaves: fork.centreLane,
        starts: false,
      });
    }
    if (next) centreLane = next.side < 0 ? 'e' : 'b';
  });
  return spans;
}

/**
 * A last stage and its goal: one span on lane b, or, entered from a fork's left side, the stage on lane e to
 * `GOAL_CENTRE` and the rest with its goal on lane b (the goal's lane e ends), joined by lane b.
 */
function lastStageSpans(
  stage: Stage,
  goal: GoalOptions,
  first: boolean,
  centreLane: 'b' | 'e',
  id: string,
): RoadSpan[] {
  const own = stageSpan(stage, { first, fork: null, goal, centreLane: 'b' });
  if (centreLane === 'b') return [{ span: own, id, leaves: 'b', starts: true }];
  const entered = stageSpan(stage, { first, fork: null, goal, centreLane: 'e' });
  return [
    { span: sliceSpan(entered, 0, GOAL_CENTRE), id, leaves: 'b', starts: true },
    { span: sliceSpan(own, GOAL_CENTRE, own.length), id: `${id}-goal`, leaves: 'b', starts: false },
  ];
}
