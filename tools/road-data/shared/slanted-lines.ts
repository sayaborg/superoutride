/**
 * Lines across a course's road where its plan does not run along them ([Original road
 * data](../../../docs/original-road-data.md#plan-from-a-tables-arcs)): a function of the station laid as straight knots
 * within a tolerance, and the few lines a picture's edges are read from where a constant offset across the road spans a
 * varying width across the plan.
 */

/**
 * Knots `[s, f(s)]` over `[a, b]`, straight between them within `tolerance` of `f`: a part is halved until its middle
 * and its quarter points lie within it.
 */
export function knotsWithin(f: (s: number) => number, a: number, b: number, tolerance: number): [number, number][] {
  if (!(b > a)) throw new RangeError(`An empty stretch [${a}, ${b}] has no knots`);
  const out: [number, number][] = [[a, f(a)]];
  const part = (x: number, fx: number, y: number, fy: number, depth: number) => {
    const off = (t: number) => Math.abs(f(x + (y - x) * t) - (fx + (fy - fx) * t));
    if (depth < 16 && Math.max(off(0.25), off(0.5), off(0.75)) > tolerance) {
      const m = (x + y) / 2;
      const fm = f(m);
      part(x, fx, m, fm, depth + 1);
      part(m, fm, y, fy, depth + 1);
    } else out.push([y, fy]);
  };
  part(a, out[0]![1], b, f(b), 0);
  return out;
}

/**
 * The offsets a line is drawn at for edges at `offsets` across it, each edge read from the nearest at its own offset
 * from it times a mean span: where a unit across spans `least` to `most` across the plan, an edge `d` from its line
 * lies within `d * (most - least) / 2` of its true place, so the lines are as few as keep that within `tolerance`.
 * Returns each line's offset and, for an edge, its line's and its offset from it across the plan.
 */
export function readingLines(offsets: readonly number[], least: number, most: number, tolerance: number) {
  const spread = (most - least) / 2;
  const mean = (most + least) / 2;
  const sorted = [...new Set(offsets)].sort((a, b) => a - b);
  const lines: number[] = [];
  // Where the span hardly varies, one line through the road's middle reads every edge.
  if (spread * Math.max(...sorted.map(Math.abs), 0) <= tolerance) lines.push(0);
  else
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && ((sorted[j + 1]! - sorted[i]!) / 2) * spread <= tolerance) j++;
      lines.push((sorted[i]! + sorted[j]!) / 2);
      i = j + 1;
    }
  return {
    lines,
    read(offset: number) {
      const k = lines.reduce((best, l, i) => (Math.abs(offset - l) < Math.abs(offset - lines[best]!) ? i : best), 0);
      return { line: k, offset: (offset - lines[k]!) * mean };
    },
  };
}
