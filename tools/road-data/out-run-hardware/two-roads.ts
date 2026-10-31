/**
 * Two roads drawn together ([OUTRUN road data](../../../docs/outrun-road-data.md#cross-section)): one road's picture
 * across, its lines and edge bands as its road ROM draws them, the picture of two or more such roads where they meet,
 * and the lanes driven over two of them.
 * Every amount is in road units, positive right.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { requireInput } from '../../authoring/authoring-error.js';
import type { Quadratic } from '../shared/quadratic.js';
import { ROAD_LINE_CENTRE, ROAD_LINE_PIXELS, roadLine } from '../sega-16/rom-images.js';
import { OPEN } from '../shared/shared-constants.js';

/** A painted interval narrowing to nothing at a stretch's end is drawn to where it is this wide, metres. */
export const THIN = 1e-5;
/** A width is there where it is wider than this, units. */
export const THERE = 1e-9;

/**
 * Where two roads `half` units either side of their centres, centred `w` either side of their middle (`width`), leave
 * ground between them no wider than `OPEN` (`unit` metres a unit): road positions, where 0 < 2(w − half) × unit ≤ OPEN.
 */
export const narrowGround = (width: Quadratic, half: number, unit: number) =>
  width.within(half, half + OPEN / (2 * unit));

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

/** How one road's ROM line draws a point: its surface, a line, its edge band, or outside the road. */
export type Paint = 'surface' | 'line' | 'edge' | 'outside';

/** One road's picture across from its centre: each edge, left to right, with the paint to its right. */
export type RoadPicture = readonly { readonly at: number; readonly right: Paint }[];

/** How one road of picture `picture` centred at 0 draws `x`. */
export function paintAt(picture: RoadPicture, x: number): Paint {
  let paint: Paint = 'outside';
  for (const e of picture) if (x >= e.at) paint = e.right;
  return paint;
}

/** The road ROM's nearest line, 1 pixel a unit. */
const NEAREST = 255;
/** The road ROM's pixel values: the surface, a line's color, an edge band's, beyond the road. */
const ROM_PAINT: readonly Paint[] = ['surface', 'line', 'edge', 'outside'];

/**
 * Check one road's picture `picture` against its road ROM's nearest line (`rom`, the ROM `name`): each pixel's value
 * (`roadLine`) is what `paintAt` gives at its centre, but within a unit of an edge (the ROM draws them on whole pixels)
 * and within `undrawn` of the centre, where a line the picture leaves out lies. Throws where they disagree.
 */
export function checkRoadPicture(rom: Uint8Array, name: string, picture: RoadPicture, undrawn = 0) {
  const line = roadLine(rom, NEAREST);
  for (let x = 0; x < ROAD_LINE_PIXELS; x++) {
    const d = x + 0.5 - ROAD_LINE_CENTRE;
    if (Math.abs(d) < undrawn || picture.some((e) => Math.abs(d - e.at) < 1)) continue;
    const [drawn, shown] = [ROM_PAINT[line[x]!]!, paintAt(picture, d)];
    requireInput(
      drawn === shown,
      `/rom/${name}`,
      `The road ROM draws ${drawn} at ${d} units from its centre, not ${shown}`,
    );
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

/**
 * The lanes driven over two roads of picture `picture`, road 0's centre at −w and road 1's at +w
 * ([Two roads](../../../docs/original-road-data.md#two-roads)), from the picture alone: its lane lines' middle `line`
 * (its innermost line's), its outer lane's outer edge `inside` (the next line's middle, or the edge band where it comes
 * first) and its half width `half`, beyond which the ground shows. Each road's outer lane is `inside − line`; b and e
 * lie between a road's lane lines, c and d between road 0's and road 1's; the median is the ground between the roads,
 * from where it shows:
 * - w ≤ line: c = d = 0, b = e = w + line (b and e share the lane between the roads' lane lines);
 * - line ≤ w ≤ half: b = e = 2 line, c = d = w − line, no median (c and d meet at the roads' middle);
 * - half ≤ w ≤ 2 half − inside: c = d = 2 half − line − w, the median 4(w − half);
 * - beyond: c = d = inside − line, the median 2(w − inside), the edge bands and the ground between.
 * Lane b's centre is road 0's wherever both its lane lines show. `breaks` are the widths at which the rule changes.
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
  return Object.freeze({
    lanes,
    /** The centre of lane b at road width `w`, units from the roads' middle (negative: left). */
    centreLaneAt: (w: number) => (w >= line ? -w : -(w + line) / 2),
    breaks: Object.freeze([line, half, farthest]) as readonly number[],
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
 * The picture of roads of picture `picture` centred at `centres` (units, left to right), road 0 first in priority: at
 * each point the surface of any road wins, then road 0's line or edge, then the next road's, then the ground. Returns
 * the lines and edge bands that show, each delimited by the feature edges either side, merged where they touch and paint
 * alike.
 */
export function composite(centres: readonly number[], picture: RoadPicture): PaintedInterval[] {
  return compositeOf(
    centres.map((c) => picture.map((e) => c + e.at)),
    picture,
  );
}

/**
 * `composite` of roads each given by where its picture's edges lie (`edges[road][k]` the lateral of `picture[k]`, in
 * order): a road laid where it passes, its edges not at fixed distances from its centre.
 */
export function compositeOf(edges: readonly (readonly number[])[], picture: RoadPicture): PaintedInterval[] {
  const paintOf = (road: readonly number[], x: number): Paint => {
    let k = road.length - 1;
    while (k >= 0 && x < road[k]!) k--;
    return k < 0 ? 'outside' : picture[k]!.right;
  };
  const all = edges
    .flatMap((road, r) => road.map((x, k) => ({ road: r, at: picture[k]!.at, x })))
    .sort((a, b) => a.x - b.x || a.road - b.road);
  const out: (PaintedInterval & { x: number })[] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const [a, b] = [all[i]!, all[i + 1]!];
    if (b.x <= a.x) continue;
    const mid = (a.x + b.x) / 2;
    const paints = edges.map((road) => paintOf(road, mid));
    if (paints.includes('surface')) continue;
    const shown = paints.find((p) => p !== 'outside');
    if (shown === undefined || shown === 'surface') continue;
    const last = out.at(-1);
    const left = { road: a.road, at: a.at },
      right = { road: b.road, at: b.at };
    if (last && last.paint === shown && last.x === a.x) {
      out[out.length - 1] = { ...last, right, x: b.x };
    } else out.push({ paint: shown, left, right, x: b.x });
  }
  return out.map(({ paint, left, right }) => ({ paint, left, right }));
}

/** Where the roads' picture is sampled for changes, positions. */
const SAMPLE = 0.25;
/** The halvings that narrow down a change of the picture between two samples. */
const HALVINGS = 40;

/**
 * The stretches of positions `[from, to]` over which the roads' picture (`pictureAt`, its arrangement `key`) keeps one
 * arrangement: found on a grid of `SAMPLE` positions, each change then narrowed down by `HALVINGS` halvings.
 */
export function arrangements<T>(
  from: number,
  to: number,
  pictureAt: (p: number) => { readonly key: string; readonly intervals: T },
): { from: number; to: number; intervals: T }[] {
  const out: { from: number; to: number; intervals: T }[] = [];
  const n = Math.max(1, Math.ceil((to - from) / SAMPLE));
  const mids = Array.from({ length: n }, (_, k) => from + ((to - from) * (k + 0.5)) / n);
  let start = from,
    current = pictureAt(mids[0]!);
  for (let k = 1; k < n; k++) {
    const next = pictureAt(mids[k]!);
    if (next.key === current.key) continue;
    let [lo, hi] = [mids[k - 1]!, mids[k]!];
    for (let j = 0; j < HALVINGS; j++) {
      const mid = (lo + hi) / 2;
      if (pictureAt(mid).key === current.key) lo = mid;
      else hi = mid;
    }
    out.push({ from: start, to: hi, intervals: current.intervals });
    [start, current] = [hi, next];
  }
  out.push({ from: start, to, intervals: current.intervals });
  return out;
}
