/**
 * Rows read as segments of one known color, the way compressed footage allows. The original draws each row as runs
 * of single colors; the video rings around every edge and bleeds chroma across it, errors far heavier-tailed than the
 * decoding's noise in even areas. A row is therefore read as the piecewise-constant sequence of known colors (or no
 * known color) of greatest likelihood: a pixel of a known color lies about it by a Student t of one degree of freedom
 * at the even-area noise (heavy tails take ringing in), a pixel of no known color anywhere in the color space alike,
 * and each new segment costs its two parameters by BIC. Edges then lie where luma crosses midway between the colors
 * either side.
 */

/** A pixel's luma and color difference (BT.601, 8-bit units), for comparing colors with each other alone. */
export function ycc(r: number, g: number, b: number): [number, number, number] {
  return [
    0.299 * r + 0.587 * g + 0.114 * b,
    -0.168736 * r - 0.331264 * g + 0.5 * b,
    0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
}

/** A known ground color: its RGB555 value, luma and color difference, and its roles' bits. */
export interface KnownColor {
  readonly rgb555: number;
  readonly y: number;
  readonly cb: number;
  readonly cr: number;
  readonly bits: number;
}

export function knownColor(rgb555: number, bits: number): KnownColor {
  const [y, cb, cr] = ycc(
    ((rgb555 >> 10) & 31) * (255 / 31),
    ((rgb555 >> 5) & 31) * (255 / 31),
    (rgb555 & 31) * (255 / 31),
  );
  return { rgb555, y, cb, cr, bits };
}

/** The noise of a decoded pixel about its true color in even areas: its standard deviation per channel (8-bit). */
export interface RowNoise {
  readonly sigma: number;
}

/**
 * −2 log likelihood of a pixel: of a known color at squared normalized distance `d2` (a Student t of ν = 1 in three
 * channels, `4·ln(1 + d²) + 2·ln(π²·Γ(1/2)) + 6·ln σ`), and of no known color, spread evenly over the 255³ cube.
 */
function knownCost(d2: number, sigma: number) {
  return 4 * Math.log1p(d2) + 4.578 + 6 * Math.log(sigma);
}
const UNKNOWN_COST = 6 * Math.log(255);

/** How far a pixel's luma may lie from a known color's and still be likelier that color than none. */
export function glyphReach(sigma: number): number {
  return sigma * Math.sqrt(Math.expm1((UNKNOWN_COST - knownCost(0, sigma)) / 4));
}

/** A row read as segments of one color (`color` the RGB555 value, 0 for none), with sub-pixel ends. */
export interface Segment {
  start: number;
  end: number;
  color: number;
  bits: number;
}

/** One row's planes. */
export interface RowPlanes {
  readonly Y: Float32Array;
  readonly Cb: Float32Array;
  readonly Cr: Float32Array;
  readonly offset: number;
  readonly width: number;
}

/**
 * The likeliest reading of one row: for each pixel, the index into `known` of its segment's color (−1 for none). The
 * candidates are the colors some pixel of the row is likelier to be than no known color.
 */
function segmentRow(row: RowPlanes, known: readonly KnownColor[], noise: RowNoise, penalty: number): Int16Array {
  const { Y, Cb, Cr, offset, width } = row;
  const variance = noise.sigma ** 2;
  const cost = (k: number, x: number) => {
    const c = known[k]!;
    const d2 = ((Y[offset + x]! - c.y) ** 2 + (Cb[offset + x]! - c.cb) ** 2 + (Cr[offset + x]! - c.cr) ** 2) / variance;
    return knownCost(d2, noise.sigma);
  };
  // Within this luma distance a known color can be likelier than none.
  const reach = glyphReach(noise.sigma);
  const order = luminanceOrder(known);
  const found = new Uint8Array(known.length);
  for (let x = 0; x < width; x++) {
    const y = Y[offset + x]!;
    for (let i = lowerBound(order.lumas, y - reach); i < order.lumas.length && order.lumas[i]! <= y + reach; i++) {
      const k = order.indices[i]!;
      if (!found[k] && cost(k, x) < UNKNOWN_COST) found[k] = 1;
    }
  }
  const candidates: number[] = [];
  for (let k = 0; k < known.length; k++) if (found[k]) candidates.push(k);
  // States: 0 for no known color, then the candidates.
  const states = candidates.length + 1;
  const back = new Int16Array(width * states);
  let total = new Float64Array(states),
    next = new Float64Array(states);
  for (let s = 0; s < states; s++) total[s] = s === 0 ? UNKNOWN_COST : cost(candidates[s - 1]!, 0);
  for (let x = 1; x < width; x++) {
    let bestState = 0;
    for (let s = 1; s < states; s++) if (total[s]! < total[bestState]!) bestState = s;
    const switchCost = total[bestState]! + penalty;
    for (let s = 0; s < states; s++) {
      const stay = total[s]!;
      const pixel = s === 0 ? UNKNOWN_COST : cost(candidates[s - 1]!, x);
      if (stay <= switchCost) {
        next[s] = stay + pixel;
        back[x * states + s] = s;
      } else {
        next[s] = switchCost + pixel;
        back[x * states + s] = bestState;
      }
    }
    [total, next] = [next, total];
  }
  let state = 0;
  for (let s = 1; s < states; s++) if (total[s]! < total[state]!) state = s;
  const labels = new Int16Array(width);
  for (let x = width - 1; x >= 0; x--) {
    labels[x] = state === 0 ? -1 : candidates[state - 1]!;
    if (x > 0) state = back[x * states + state]!;
  }
  return labels;
}

const orders = new WeakMap<readonly KnownColor[], { lumas: Float64Array; indices: Int32Array }>();
/** The known colors in order of luma, made once per list. */
function luminanceOrder(known: readonly KnownColor[]) {
  let order = orders.get(known);
  if (!order) {
    const indices = Int32Array.from(known.keys()).sort((a, b) => known[a]!.y - known[b]!.y);
    order = { lumas: Float64Array.from(indices, (k) => known[k]!.y), indices };
    orders.set(known, order);
  }
  return order;
}
function lowerBound(values: Float64Array, target: number) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The penalty of one more segment in a row of `width` pixels: BIC's cost of its two parameters (where, which color). */
export function segmentPenalty(width: number): number {
  return 2 * Math.log(width);
}

/** Consecutive equal labels as runs. */
function labelRuns(labels: Int16Array) {
  const runs: { start: number; end: number; k: number }[] = [];
  for (let x = 0; x < labels.length; x++) {
    const last = runs.at(-1);
    if (last && last.k === labels[x]) last.end = x + 1;
    else runs.push({ start: x, end: x + 1, k: labels[x]! });
  }
  return runs;
}

/**
 * A row's segments: the cheapest reading, each edge between two known colors moved to where luma, interpolated
 * between pixel centres, crosses midway between their lumas within a pixel of the boundary. Between road segments
 * (`roles.road`), a segment whose color is not a line's takes the nearest line color within three deviations of its
 * mean luma instead (a white dash and a white rumble stripe may differ only in luma).
 */
export function rowSegments(
  row: RowPlanes,
  known: readonly KnownColor[],
  noise: RowNoise,
  roles: { readonly road: number; readonly line: number },
): Segment[] {
  const labels = segmentRow(row, known, noise, segmentPenalty(row.width));
  const segments = labelRuns(labels);
  const { Y, Cb, Cr, offset } = row;
  const variance = noise.sigma ** 2;
  // Between road segments, a line color the pixels cannot tell from the segment's own (within one more parameter's
  // cost) is taken.
  const summed = (k: number, s: { start: number; end: number }) => {
    let sum = 0;
    for (let x = s.start; x < s.end; x++) {
      const c = known[k]!;
      sum += knownCost(
        ((Y[offset + x]! - c.y) ** 2 + (Cb[offset + x]! - c.cb) ** 2 + (Cr[offset + x]! - c.cr) ** 2) / variance,
        noise.sigma,
      );
    }
    return sum;
  };
  for (let i = 1; i < segments.length - 1; i++) {
    const s = segments[i]!;
    const before = segments[i - 1]!.k,
      after = segments[i + 1]!.k;
    if (s.k < 0 || before < 0 || after < 0) continue;
    if (!(known[before]!.bits & roles.road) || !(known[after]!.bits & roles.road) || known[s.k]!.bits & roles.line)
      continue;
    const own = summed(s.k, s);
    let best = -1,
      bestCost = own + segmentPenalty(row.width);
    known.forEach((c, k) => {
      if (!(c.bits & roles.line)) return;
      const cost = summed(k, s);
      if (cost <= bestCost) [best, bestCost] = [k, cost];
    });
    if (best >= 0) s.k = best;
  }
  const out: Segment[] = segments.map((s) => ({
    start: s.start,
    end: s.end,
    color: s.k < 0 ? 0 : known[s.k]!.rgb555,
    bits: s.k < 0 ? 0 : known[s.k]!.bits,
  }));
  for (let i = 1; i < out.length; i++) {
    const a = segments[i - 1]!.k,
      b = segments[i]!.k;
    if (a < 0 || b < 0) continue;
    const mid = (known[a]!.y + known[b]!.y) / 2;
    const boundary = segments[i]!.start;
    // Luma between pixel centres near the boundary, crossing midway within a pixel of it.
    let edge = boundary;
    for (let x = Math.max(0, boundary - 2); x < Math.min(row.width - 1, boundary + 1); x++) {
      const p = Y[offset + x]!,
        q = Y[offset + x + 1]!;
      if ((p - mid) * (q - mid) <= 0 && p !== q) {
        const crossing = x + 0.5 + (mid - p) / (q - p);
        if (Math.abs(crossing - boundary) <= 1) edge = crossing;
        break;
      }
    }
    // An edge never passes either segment's middle.
    edge = Math.min(
      Math.max(edge, (out[i - 1]!.start + segments[i - 1]!.end) / 2),
      (segments[i]!.start + out[i]!.end) / 2,
    );
    out[i - 1]!.end = edge;
    out[i]!.start = edge;
  }
  return out;
}

/**
 * Whether a segment's pixels away from both its ends by two pixels (past the chroma its neighbours bleed into it and
 * its edges' strongest ringing) average to its known color: their mean, as RGB, lies nearest that RGB555 color, half a
 * lattice step (255/62) each way. A segment with no such pixels keeps its color. The likeliest reading takes each pixel
 * alone, so a long run of a color close to a known one (a black tyre beside a shadow's dark grey) reads as that color;
 * its mean tells them apart.
 */
export function meanIsColor(
  segment: Segment,
  row: RowPlanes,
  rgb: Uint8Array | Uint8ClampedArray,
  channels: number,
): boolean {
  if (segment.color === 0) return false;
  let n = 0;
  const sum = [0, 0, 0];
  for (let x = Math.ceil(segment.start + 1.5); x + 0.5 <= segment.end - 2; x++) {
    n++;
    for (let c = 0; c < 3; c++) sum[c]! += rgb[(row.offset + x) * channels + c]!;
  }
  if (!n) return true;
  const level = [(segment.color >> 10) & 31, (segment.color >> 5) & 31, segment.color & 31];
  return sum.every((value, c) => Math.abs(value / n - (level[c]! * 255) / 31) <= 255 / 62);
}
