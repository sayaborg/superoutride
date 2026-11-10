/**
 * Two roads drawn together ([Two roads](../../../docs/original-road-data.md#two-roads)): one road's picture across,
 * its lines and edge bands as its original's nearest line of road draws them, the picture of two or more roads where
 * they meet, each with its own picture and width, and the lanes driven over two roads of one picture.
 * Every amount is in road units, positive right.
 */
import { romDiffers } from './conversion-errors.js';
import { PiecewiseLinear, straightThrough } from './piecewise-linear.js';
import { OPEN } from './shared-constants.js';

/** A painted interval narrowing to nothing at a stretch's end is drawn to where it is this wide, metres. */
export const THIN = 1e-5;
/** A width is there where it is wider than this, units. */
export const THERE = 1e-9;

/**
 * Where two roads `halves` units either side of their centres (road 0's, road 1's), `w` half the distance between their
 * centres (`width`), leave ground between them no wider than `OPEN` (`unit` metres a unit): road positions, where
 * 0 < (2w − halves' sum) × unit ≤ OPEN.
 */
export const narrowGround = (width: PiecewiseLinear, halves: readonly [number, number], unit: number) => {
  const touching = (halves[0] + halves[1]) / 2;
  return width.within(touching, touching + OPEN / (2 * unit));
};

/**
 * The stretch of `[from, to]` an interval of the roads' picture is drawn over, by its `width` (metres) at each place:
 * each end where it narrows to nothing drawn in towards the middle to where it is `THIN` wide; null where it is
 * nowhere that wide, or drawn over less than a millimetre.
 */
export function drawnInterval(width: (at: number) => number, from: number, to: number): [number, number] | null {
  const inward = (end: number, toward: number) => {
    if (width(end) >= THIN) return end;
    let [lo, hi] = [end, toward];
    if (width(hi) < THIN) return null;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (width(mid) >= THIN) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const mid = (from + to) / 2;
  const [a, b] = [inward(from, mid), inward(to, mid)];
  return a === null || b === null || b - a < 1e-3 ? null : [a, b];
}

/**
 * Each interval of the roads' picture over its arrangements (`arrangements`), with the stretch it is drawn over there
 * (`drawnInterval`, by its `width` in metres), where it is drawn at all.
 */
export function* drawnIntervals<I>(
  regimes: readonly { readonly from: number; readonly to: number; readonly intervals: readonly I[] }[],
  width: (interval: I) => (at: number) => number,
) {
  for (const regime of regimes)
    for (const interval of regime.intervals) {
      const drawn = drawnInterval(width(interval), regime.from, regime.to);
      if (drawn) yield { interval, from: drawn[0], to: drawn[1] };
    }
}

/** How one road's line draws a point: its surface, a line, its edge band, or outside the road. */
export type Paint = 'surface' | 'line' | 'edge' | 'outside';

/**
 * An original's nearest line of road as its hardware's layer reads it: each pixel's paint, left to right, the pixel
 * edge its road's centre lies on, and the road units a pixel spans.
 */
export interface DrawnLine {
  readonly paints: readonly Paint[];
  readonly centre: number;
  readonly unitsAPixel: number;
}

/** One road's picture across from its centre: each edge, left to right, with the paint to its right. */
export type RoadPicture = readonly { readonly at: number; readonly right: Paint }[];

/** How one road of picture `picture` centred at 0 draws `x`. */
export function paintAt(picture: RoadPicture, x: number): Paint {
  let paint: Paint = 'outside';
  for (const e of picture) if (x >= e.at) paint = e.right;
  return paint;
}

/**
 * Check one road's picture `picture` against its original's nearest line of road (`line`, read from `name`): each
 * pixel's paint is what `paintAt` gives at its centre, but within a pixel of an edge (the line draws them on whole
 * pixels) and within `undrawn` of the centre, where a line the picture leaves out lies. Throws where they disagree.
 */
export function checkRoadPicture(line: DrawnLine, name: string, picture: RoadPicture, undrawn = 0) {
  const { paints, centre, unitsAPixel } = line;
  for (let x = 0; x < paints.length; x++) {
    const d = (x + 0.5 - centre) * unitsAPixel;
    if (Math.abs(d) < undrawn || picture.some((e) => Math.abs(d - e.at) < unitsAPixel)) continue;
    const [drawn, shown] = [paints[x]!, paintAt(picture, d)];
    if (drawn !== shown) throw romDiffers(`${name} draws ${drawn} at ${d} units from its centre, not ${shown}`);
  }
}

/** The lanes driven over two roads at one road width: a, b, c | median m | d, e, f, units, left to right. */
export interface DrivenLanes {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly m: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/** The lanes over two roads at one place: their widths, the roads' middle and w, the left road and lane b's centre. */
export interface LanesAt {
  readonly lanes: DrivenLanes;
  /** The roads' middle and half the distance between their centres, units from P. */
  readonly middle: number;
  readonly w: number;
  /** The road whose centre lies left (0 or 1): a, b and c are its lanes, d, e and f the other's. */
  readonly left: 0 | 1;
  /** Lane b's centre, units from P. */
  readonly centreLane: number;
}

/** The lanes over two roads along P: each lane's width and lane b's centre, and which road is left where. */
export interface LanesAlong {
  readonly widths: Readonly<Record<keyof DrivenLanes, PiecewiseLinear>>;
  readonly centreLane: PiecewiseLinear;
  /** The stretches over which each road is the left one, in order: one ends and the next begins where the centres meet. */
  readonly left: readonly { readonly from: number; readonly to: number; readonly road: 0 | 1 }[];
}

/** The lanes' names, left to right. */
const LANE_NAMES = ['a', 'b', 'c', 'm', 'd', 'e', 'f'] as const;
/** Two positions along P this close are one vertex. */
const SAME_PLACE = 1e-9;

/**
 * The lanes driven over two roads of picture `picture` ([Two roads](../../../docs/original-road-data.md#two-roads)), one
 * rule wherever each road's centre lies, either side of the other, w half the distance between their centres, taken
 * from the picture alone: its lane lines' middle `line` (its innermost line's), its outer lane's outer edge `inside`
 * (the next line's middle, or its edge band where that comes first) and its half width `half`, beyond which the ground
 * shows. The lanes are a, b, c | median | d, e, f, left to right: a and f, each road's outer lane, are `inside − line`;
 * b and e lie between a road's lane lines and c and d between the left road's and the right road's; the median is the
 * ground between the roads, there only where it shows:
 * - w ≤ line: c = d = 0, b = e = w + line (b and e share the lane between the roads' lane lines);
 * - line ≤ w ≤ half: b = e = 2 line, c = d = w − line, no median (c and d meet at the roads' middle);
 * - half ≤ w ≤ 2 half − inside: c = d = 2 half − line − w, the median 4(w − half);
 * - beyond: c = d = inside − line, the median 2(w − inside), the edge bands and the ground between.
 * Lane b's centre is the left road's wherever both its lane lines show (w ≥ line), else (w + line) / 2 left of their
 * middle. Where the roads change sides their centres meet: w is 0 there and the lanes' widths change slope, a, b, c
 * staying the left road's lanes and d, e, f the right road's, whichever road each is. OUTRUN's and TURBO OUTRUN's roads
 * lie w either side of P (`lanes`, `centreLaneAt`); `lanesAt` takes each road's centre at one place and `lanesAlong`
 * along P. `breaks` are the widths at which the rule changes.
 */
export function lanesOverTwoRoads(picture: RoadPicture) {
  const right = picture.filter((e) => e.at >= 0);
  const lineAt = right.findIndex((e) => e.right === 'line');
  const next = right.findIndex((e, k) => k > lineAt + 1 && e.right !== 'surface');
  const half = right.find((e) => e.right === 'outside')?.at;
  if (lineAt < 0 || next < 0 || half === undefined)
    throw romDiffers('A road picture lacks a lane line, an outer edge or its outside');
  const middle = (k: number) => (right[k]!.at + right[k + 1]!.at) / 2;
  const line = middle(lineAt);
  const inside = right[next]!.right === 'line' ? middle(next) : right[next]!.at;
  const outer = inside - line;
  const farthest = 2 * half - inside;
  const lanes = (w: number): DrivenLanes => {
    if (w <= line) return { a: outer, b: w + line, c: 0, m: 0, d: 0, e: w + line, f: outer };
    const sides = { a: outer, b: 2 * line, e: 2 * line, f: outer };
    if (w <= half) return { ...sides, c: w - line, m: 0, d: w - line };
    if (w <= farthest) return { ...sides, c: 2 * half - line - w, m: 4 * (w - half), d: 2 * half - line - w };
    return { ...sides, c: outer, m: 2 * (w - inside), d: outer };
  };
  /** The centre of lane b at road width `w`, units from the roads' middle (negative: left). */
  const centreLaneAt = (w: number) => (w >= line ? -w : -(w + line) / 2);
  const breaks = Object.freeze([line, half, farthest]) as readonly number[];
  /** The lanes with road 0's centre at `centre0` and road 1's at `centre1`, units from P. */
  const lanesAt = (centre0: number, centre1: number): LanesAt => {
    const middle = (centre0 + centre1) / 2;
    const w = Math.abs(centre1 - centre0) / 2;
    return { lanes: lanes(w), middle, w, left: centre0 <= centre1 ? 0 : 1, centreLane: middle + centreLaneAt(w) };
  };
  /**
   * The lanes along P with road 0's centre at `centre0` and road 1's at `centre1` (units from P, each straight between
   * its knots): each lane's width and lane b's centre straight between vertices at the centres' knots, where w crosses
   * a width of the rule (`breaks`) and where the centres meet, the roads changing sides there; continuous at each.
   */
  const lanesAlong = (centre0: PiecewiseLinear, centre1: PiecewiseLinear): LanesAlong => {
    const ends = [...centre0.breaks, ...centre1.breaks];
    const [start, end] = [Math.min(...ends), Math.max(...ends)];
    const knots = [...new Set(ends)].sort((x, y) => x - y);
    // Between neighbouring knots both centres are straight, so their difference is: it meets 0 and ±2 × each width of
    // the rule at most once each.
    const vertices = [...knots];
    for (let i = 0; i + 1 < knots.length; i++) {
      const [p, q] = [knots[i]!, knots[i + 1]!];
      const [dp, dq] = [centre1.at(p) - centre0.at(p), centre1.at(q) - centre0.at(q)];
      for (const v of [0, ...breaks.flatMap((b) => [2 * b, -2 * b])]) {
        if ((dp - v) * (dq - v) < 0) vertices.push(p + ((v - dp) * (q - p)) / (dq - dp));
      }
    }
    const places = vertices
      .sort((x, y) => x - y)
      .filter((p, i, all) => p >= start && p <= end && (i === 0 || p - all[i - 1]! > SAME_PLACE));
    const at = places.map((p) => lanesAt(centre0.at(p), centre1.at(p)));
    const along = (value: (l: LanesAt) => number) =>
      places.length > 1
        ? straightThrough(places.map((p, i) => [p, value(at[i]!)] as const))
        : new PiecewiseLinear([{ from: start, to: end, a: value(at[0]!), b: 0 }]);
    const left: { from: number; to: number; road: 0 | 1 }[] = [];
    for (let i = 0; i + 1 < places.length; i++) {
      const [p, q] = [places[i]!, places[i + 1]!];
      const road = lanesAt(centre0.at((p + q) / 2), centre1.at((p + q) / 2)).left;
      const last = left.at(-1);
      if (last && last.road === road) last.to = q;
      else left.push({ from: p, to: q, road });
    }
    if (left.length === 0) left.push({ from: start, to: end, road: at[0]!.left });
    return Object.freeze({
      widths: Object.freeze(
        Object.fromEntries(LANE_NAMES.map((n) => [n, along((l) => l.lanes[n])])) as Record<
          keyof DrivenLanes,
          PiecewiseLinear
        >,
      ),
      centreLane: along((l) => l.centreLane),
      left: Object.freeze(left.map((s) => Object.freeze(s))),
    });
  };
  return Object.freeze({
    lanes,
    centreLaneAt,
    lanesAt,
    lanesAlong,
    breaks,
    /** A road's centre lies this far inside its outer lane's outer edge. */
    inside,
    /** The roads are one road, with no median, at widths up to this. */
    half,
    /** The outer lanes' width. */
    outer,
  });
}

/** Where a composite interval's side lies: road `road`'s feature edge `at` units from its centre. */
export interface FeatureEdge {
  readonly road: number;
  readonly at: number;
}

/** A painted interval of the roads' picture: a line or an edge band, from `left` to `right`. */
export interface PaintedInterval {
  readonly paint: 'line' | 'edge';
  readonly left: FeatureEdge;
  readonly right: FeatureEdge;
}

/**
 * The levels one road's paints are drawn at where roads overlap, its hardware's order: at each point the paint of the
 * highest level shows, at a tie the earlier road's.
 */
export interface PaintLevels {
  readonly surface: number;
  readonly line: number;
  readonly edge: number;
}

/**
 * Sega's order of `roads` roads (OUTRUN's and TURBO OUTRUN's): any road's surface over road 0's lines and edges, over
 * road 1's, and so on.
 */
export const segaLevels = (roads: number): readonly PaintLevels[] =>
  Array.from({ length: roads }, (_, r) => ({ surface: roads, line: roads - 1 - r, edge: roads - 1 - r }));

/**
 * The picture of roads of pictures `pictures` centred at `centres` (units, in either order), drawn in their hardware's
 * order `levels` (Sega's by default). Returns the lines and edge bands that show, each delimited by the feature edges
 * either side, merged where they touch and paint alike.
 */
export function composite(
  centres: readonly number[],
  pictures: readonly RoadPicture[],
  levels: readonly PaintLevels[] = segaLevels(centres.length),
): PaintedInterval[] {
  return compositeOf(
    centres.map((c, r) => pictures[r]!.map((e) => c + e.at)),
    pictures,
    levels,
  );
}

/** A stretch between two neighbouring feature edges of the roads' picture: its sides and what shows over it. */
interface ShownStretch {
  readonly left: FeatureEdge;
  readonly right: FeatureEdge;
  /** Its sides' laterals. */
  readonly from: number;
  readonly to: number;
  /** The road whose paint shows, its picture's piece (from its edge `piece` to the next) and that paint; -1 where none. */
  readonly road: number;
  readonly piece: number;
  readonly paint: Paint;
}

/**
 * Each stretch between neighbouring feature edges of roads given by where their pictures' edges lie (`edges`, as
 * `compositeOf`), left to right, and the paint that shows over it: the highest level's of the roads that paint it, at a
 * tie the earlier road's.
 */
function* shownStretches(
  edges: readonly (readonly number[])[],
  pictures: readonly RoadPicture[],
  levels: readonly PaintLevels[],
): Generator<ShownStretch> {
  // Road r's piece at `x`: the last of its edges at or left of x, -1 left of them all.
  const pieceOf = (r: number, x: number) => {
    const road = edges[r]!;
    let k = road.length - 1;
    while (k >= 0 && x < road[k]!) k--;
    return k;
  };
  const all = edges
    .flatMap((road, r) => road.map((x, k) => ({ road: r, at: pictures[r]![k]!.at, x })))
    .sort((a, b) => a.x - b.x || a.road - b.road);
  for (let i = 0; i + 1 < all.length; i++) {
    const [a, b] = [all[i]!, all[i + 1]!];
    if (b.x <= a.x) continue;
    const mid = (a.x + b.x) / 2;
    let [paint, road, piece, level]: [Paint, number, number, number] = ['outside', -1, -1, -Infinity];
    for (let r = 0; r < edges.length; r++) {
      const k = pieceOf(r, mid);
      const shown = k < 0 ? 'outside' : pictures[r]![k]!.right;
      if (shown !== 'outside' && levels[r]![shown] > level)
        [paint, road, piece, level] = [shown, r, k, levels[r]![shown]];
    }
    yield {
      left: { road: a.road, at: a.at },
      right: { road: b.road, at: b.at },
      from: a.x,
      to: b.x,
      road,
      piece,
      paint,
    };
  }
}

/**
 * `composite` of roads each given by where its picture's edges lie (`edges[road][k]` the lateral of
 * `pictures[road][k]`, in order): a road laid where it passes, its edges not at fixed distances from its centre.
 */
export function compositeOf(
  edges: readonly (readonly number[])[],
  pictures: readonly RoadPicture[],
  levels: readonly PaintLevels[] = segaLevels(edges.length),
): PaintedInterval[] {
  const out: (PaintedInterval & { x: number })[] = [];
  for (const { left, right, from, to, paint } of shownStretches(edges, pictures, levels)) {
    if (paint === 'outside' || paint === 'surface') continue;
    const last = out.at(-1);
    if (last && last.paint === paint && last.x === from) {
      out[out.length - 1] = { ...last, right, x: to };
    } else out.push({ paint, left, right, x: to });
  }
  return out.map(({ paint, left, right }) => ({ paint, left, right }));
}

/** A piece of one road's picture where it shows: road `road`'s piece `piece` (from its edge `piece` to the next). */
export interface ShownPiece {
  readonly road: number;
  readonly piece: number;
  readonly paint: Exclude<Paint, 'outside'>;
  readonly left: FeatureEdge;
  readonly right: FeatureEdge;
}

/**
 * Where each road's picture shows among roads each given by where its picture's edges lie (`edges`, as `compositeOf`),
 * in their hardware's order `levels`: each piece of a road's picture that shows, its surface's too, between the feature
 * edges either side, merged where they touch and are one road's one piece, so that a road whose surface lies beneath
 * another's paint is drawn only where it shows.
 */
export function shownPieces(
  edges: readonly (readonly number[])[],
  pictures: readonly RoadPicture[],
  levels: readonly PaintLevels[] = segaLevels(edges.length),
): ShownPiece[] {
  const out: (ShownPiece & { x: number })[] = [];
  for (const { left, right, from, to, road, piece, paint } of shownStretches(edges, pictures, levels)) {
    if (paint === 'outside') continue;
    const last = out.at(-1);
    if (last && last.road === road && last.piece === piece && last.x === from) {
      out[out.length - 1] = { ...last, right, x: to };
    } else out.push({ road, piece, paint, left, right, x: to });
  }
  return out.map(({ road, piece, paint, left, right }) => ({ road, piece, paint, left, right }));
}

/** An arrangement shorter than this is not written: the format writes stations to the micrometre, metres. */
const SHORTEST = 1e-6;

/**
 * The stretches of positions `[from, to]` over which the roads' picture (`pictureAt`, its arrangement `key`) keeps one
 * arrangement, found exactly: between `breaks` every edge of the picture (`edgesAt`, the roads' feature edges, units)
 * is straight, so the picture changes only where two edges cross, which each stretch solves from its edges' lines.
 * Positions are metres along P less `metres(p)`'s rounding as written; an arrangement shorter than `SHORTEST` along P
 * (`metres`) joins the one before it.
 */
export function arrangements<T>(
  from: number,
  to: number,
  breaks: readonly number[],
  edgesAt: (p: number) => readonly number[],
  pictureAt: (p: number) => { readonly key: string; readonly intervals: T },
  metres: (p: number) => number = (p) => p,
): { from: number; to: number; intervals: T }[] {
  const points = [...new Set([from, to, ...breaks.filter((b) => b > from && b < to)])].sort((a, b) => a - b);
  // Each stretch's crossings: its edges' lines through a third and two thirds of the way, where any two meet.
  const cuts: number[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const [a, b] = [points[k]!, points[k + 1]!];
    cuts.push(a);
    const [p1, p2] = [a + (b - a) / 3, a + (2 * (b - a)) / 3];
    const [e1, e2] = [edgesAt(p1), edgesAt(p2)];
    const roots: number[] = [];
    for (let i = 0; i < e1.length; i++)
      for (let j = i + 1; j < e1.length; j++) {
        const [d1, d2] = [e1[i]! - e1[j]!, e2[i]! - e2[j]!];
        if (d1 === d2) continue;
        const p = p1 + ((p2 - p1) * d1) / (d1 - d2);
        if (p > a && p < b) roots.push(p);
      }
    cuts.push(...roots.sort((x, y) => x - y));
  }
  cuts.push(to);
  // The arrangement between each two cuts, alike neighbours joined; then each shorter than `SHORTEST` joins the one
  // before it (the first, the one after it).
  const runs: { from: number; to: number; key: string; intervals: T }[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const [a, b] = [cuts[k]!, cuts[k + 1]!];
    if (!(b > a)) continue;
    const { key, intervals } = pictureAt((a + b) / 2);
    const last = runs.at(-1);
    if (last && last.key === key) last.to = b;
    else runs.push({ from: a, to: b, key, intervals });
  }
  const out: typeof runs = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (last && metres(run.to) - metres(run.from) < SHORTEST) last.to = run.to;
    else if (last && metres(last.to) - metres(last.from) < SHORTEST) out[out.length - 1] = { ...run, from: last.from };
    else if (last && last.key === run.key) last.to = run.to;
    else out.push({ ...run });
  }
  return out.map(({ from: a, to: b, intervals }) => ({ from: a, to: b, intervals }));
}
