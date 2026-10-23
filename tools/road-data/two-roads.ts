/**
 * Two roads drawn together ([OUTRUN road data](../../docs/outrun-road-data.md#cross-section)): one road's picture
 * across, its lines and edge bands as its road ROM draws them, and the picture of two or more such roads where they meet.
 * Every amount is in road units, positive right.
 */

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
  const edges = centres
    .flatMap((c, road) => picture.map((e) => ({ road, at: e.at, x: c + e.at })))
    .sort((a, b) => a.x - b.x || a.road - b.road);
  const out: (PaintedInterval & { x: number })[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [a, b] = [edges[i]!, edges[i + 1]!];
    if (b.x <= a.x) continue;
    const mid = (a.x + b.x) / 2;
    const paints = centres.map((c) => paintAt(picture, mid - c));
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
