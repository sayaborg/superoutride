/**
 * What OUTRUN's roads are made from beside their pieces ([OUTRUN road data](../../docs/outrun-road-data.md)): a
 * stage's path P as straights and arcs.
 */
import { requireInput } from '../course/authoring-io.js';
import type { TurnSegment } from './offset-plan.js';
import type { CurvePoint, Path } from './road-tables.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 19;

/**
 * At a join of its curves the path turns over a position or two beyond its curves' rates: the plan gives each join this
 * many positions either side, and reads a curve's own turn this far inside it.
 */
const JOIN = 2;
/** A straight's heading varies by at most this much inside it, radians. */
const STRAIGHT_TOLERANCE = (0.1 * Math.PI) / 180;

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

/**
 * The plan: P turning as the path does, at one rate between breaks: the ends, and `JOIN` positions either side of each
 * join of the curves (moved back by the path's offset), so that the turn the path makes at a join beyond its curves'
 * rates stays there. A straight holds one heading, the middle of the path's inside it, which must not vary; an arc
 * turns inside it the side its kind says.
 */
export function stagePlan(curves: readonly CurvePoint[], path: Path, offset: number, end: number): TurnSegment[] {
  const headings = pathHeadings(path);
  requireInput(end < headings.length, '/path', `The path ends before position ${end}`);
  const starts = curves.map((c) => Math.max(0, c.position - offset));
  const straights: { from: number; to: number; heading: number }[] = [];
  curves.forEach((c, i) => {
    const [from, to] = [starts[i]!, Math.min(starts[i + 1] ?? end, end)];
    if (to <= from) return;
    // Inside the curve, where it is long enough to have an inside.
    const [a, b] = to - from > 2 * JOIN ? [from + JOIN, to - JOIN] : [from, to];
    if (c.kind === 1) {
      requireInput(to - from > 2 * JOIN, `/curves/${from}`, `The straight at ${from} is too short to read`);
      const inside = Array.from(headings.subarray(a, b + 1));
      const [least, most] = [Math.min(...inside), Math.max(...inside)];
      requireInput(most - least <= STRAIGHT_TOLERANCE, `/curves/${from}`, `The path turns on the straight at ${from}`);
      straights.push({ from, to, heading: (least + most) / 2 });
      return;
    }
    const turn = headings[b]! - headings[a]!;
    requireInput(
      Math.sign(turn) === (c.kind === 3 ? 1 : -1),
      `/curves/${from}`,
      `The path turns ${turn > 0 ? 'left' : 'right'} on the curve at ${from} of kind ${c.kind}`,
    );
  });
  const breaks = [...new Set([0, end, ...starts.slice(1).flatMap((j) => [j - JOIN, j + JOIN])])]
    .filter((p) => p >= 0 && p <= end)
    .sort((x, y) => x - y);
  const heading = (p: number) => straights.find((s) => s.from <= p && p <= s.to)?.heading ?? headings[p]!;
  return breaks.slice(1).map((to, i) => ({ from: breaks[i]!, to, turn: heading(to) - heading(breaks[i]!) }));
}
