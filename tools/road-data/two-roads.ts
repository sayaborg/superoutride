/**
 * Two roads drawn together ([OUTRUN road data](../../docs/outrun-road-data.md#cross-section)): one road's picture
 * across, its lines and edge bands as its road ROM draws them, the picture of two or more such roads where they meet,
 * and the lanes driven over two of them.
 * Every amount is in road units, positive right.
 */
import type { Quadratic } from './quadratic.js';

/**
 * The ground between two roads is their asphalt where it is no wider than this, metres, and the ground's beyond: the
 * material changes metres away from where the lanes' rule does.
 */
export const OPEN = 0.5;

/**
 * Where two roads `half` units either side of their centres, centred `w` either side of their middle (`width`), leave
 * ground between them no wider than `OPEN` (`unit` metres a unit): road positions, where 0 < 2(w − half) × unit ≤ OPEN.
 */
export const narrowGround = (width: Quadratic, half: number, unit: number) =>
  width.within(half, half + OPEN / (2 * unit));

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
 * ([Two roads](../../docs/original-road-data.md#two-roads)), from the picture alone: its lane lines' middle `line`
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
    throw new Error('A road picture lacks a lane line, an outer edge or its outside');
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
