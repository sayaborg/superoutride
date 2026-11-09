/**
 * The crests rule ([Original road data](../../../docs/original-road-data.md#crests)): at a speed V no crest throws the
 * car, so the grade falls no faster than 1/R a metre, R = V²/g. Of the profiles that keep it, the one nearest to the
 * road's in its grades (the integral of the squared difference) is taken: the monotone regression (L2) of
 * h(s) = g(s) + s/R. Each crest sharper than R becomes one stretch [a, b] over which the grade falls straight at 1/R
 * from g(a) to g(b), touching the road at both ends, the height at b the road's; outside the stretches nothing changes.
 */
import { contractUnmet } from './conversion-errors.js';
import { VEHICLE_GRAVITY } from '../../../src/vehicle/physics/vehicle-state.js';
import { heightExtremes, profileOf, type Bend, type Kink, type Profile } from './road-profile.js';

/** A stretch the rule lays: its ends and its level c = h(a) = h(b), metres. */
interface Stretch {
  a: number;
  b: number;
  c: number;
}

/**
 * `road` over `[0, length]` kept within the crests' radius `radius`, metres: unchanged where it already is (a kink down
 * is beyond any radius, a kink up is kept). A stretch reaching the road's start changes the grade there (a kink at 0);
 * the road's ends keep their heights. h is linear between the road's breaks (its bends' ends and kinks), so on those
 * and on points `step` apart pool-adjacent violators (PAVA), each point weighted by the length about it, finds where
 * the stretches lie; each stretch's ends are then solved exactly on h's pieces, so the answer does not depend on `step`.
 */
export function crestBound(road: Profile, length: number, radius: number, step = 0.5): Profile {
  const fall = 1 / radius;
  const sharp =
    road.bends.some((b) => b.curvature < -fall && b.from < length && b.to > 0) ||
    road.kinks.some((k) => k.change < 0 && k.at > 0 && k.at < length);
  if (!sharp) return road;
  const h = (s: number) => road.grade(s) + s * fall;
  // ∫ h over [a, b], exactly: the height gained and the s/R term's integral.
  const integral = (a: number, b: number) => road.height(b) - road.height(a) + ((b * b - a * a) * fall) / 2;
  const n = Math.max(2, Math.ceil(length / step));
  const stations = [
    ...new Set([
      ...Array.from({ length: n + 1 }, (_, i) => (i * length) / n),
      ...road.bends.flatMap((b) => [b.from, b.to]),
      ...road.kinks.map((k) => k.at),
    ]),
  ]
    .filter((s) => s >= 0 && s <= length)
    .sort((x, y) => x - y);
  // A kink within the road is two nodes at its station: h just before its jump, then h after it.
  const points = stations.flatMap((s) => {
    const jump = s > 0 ? kinkAt(road, s) : 0;
    return jump === 0 ? [[s, h(s)] as const] : [[s, h(s) - jump] as const, [s, h(s)] as const];
  });
  const nodes = points.map(([s]) => s);
  const pieces = new Pieces(
    nodes,
    points.map(([, v]) => v),
    h,
  );

  // Where the stretches lie: weighted PAVA on h at the nodes, each pool of more than one node a stretch's guess.
  const weight = (i: number) => (nodes[Math.min(i + 1, nodes.length - 1)]! - nodes[Math.max(i - 1, 0)]!) / 2 || 1e-12;
  const pools: { from: number; to: number; sum: number; weight: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let pool = { from: i, to: i, sum: pieces.value(i) * weight(i), weight: weight(i) };
    while (pools.length && pools.at(-1)!.sum / pools.at(-1)!.weight >= pool.sum / pool.weight) {
      const last = pools.pop()!;
      pool = { from: last.from, to: pool.to, sum: last.sum + pool.sum, weight: last.weight + pool.weight };
    }
    pools.push(pool);
  }
  let stretches: Stretch[] = pools.filter((p) => p.to > p.from).map((p) => solve(p.from, p.to, pieces, integral));
  // Stretches that meet or overlap are one: solved again together until none do.
  for (let joined = true; joined;) {
    joined = false;
    stretches.sort((x, y) => x.a - y.a);
    for (let k = 0; k + 1 < stretches.length; k++)
      if (stretches[k]!.b >= stretches[k + 1]!.a) {
        const [from, to] = [pieces.after(stretches[k]!.a), pieces.before(stretches[k + 1]!.b)];
        stretches.splice(k, 2, solve(Math.min(from, to), Math.max(from, to), pieces, integral));
        joined = true;
        break;
      }
  }
  stretches = stretches.filter((t) => t.b > t.a);

  // The road outside the stretches, and each stretch's straight fall at 1/R.
  const inside = (s: number) => stretches.some((t) => s > t.a && s < t.b);
  const bends: Bend[] = [];
  for (const bend of road.bends) {
    let parts = [{ from: bend.from, to: bend.to }];
    for (const t of stretches)
      parts = parts.flatMap((p) =>
        p.to <= t.a || p.from >= t.b
          ? [p]
          : [...(p.from < t.a ? [{ from: p.from, to: t.a }] : []), ...(p.to > t.b ? [{ from: t.b, to: p.to }] : [])],
      );
    bends.push(...parts.map((p) => ({ ...p, curvature: bend.curvature })));
  }
  const kinks: Kink[] = road.kinks.filter((k) => !inside(k.at) && !stretches.some((t) => k.at === t.a || k.at === t.b));
  for (const t of stretches) {
    bends.push({ from: t.a, to: t.b, curvature: -fall });
    // At an end where the road's grade jumps (a kink, or the road's start) the grade jumps to or from the stretch's.
    const before = t.a === 0 ? 0 : road.grade(t.a) - kinkAt(road, t.a);
    if (t.a === 0 || kinkAt(road, t.a) !== 0) kinks.push({ at: t.a, change: t.c - t.a * fall - before });
    if (t.b < length && kinkAt(road, t.b) !== 0) kinks.push({ at: t.b, change: road.grade(t.b) - (t.c - t.b * fall) });
  }
  const laid = profileOf(bends, [], kinks);
  check(road, laid, stretches, fall, length);
  return laid;
}

/** The grade's change at a kink of `road` at `s`, 0 where it has none. */
const kinkAt = (road: Profile, s: number) => road.kinks.filter((k) => k.at === s).reduce((sum, k) => sum + k.change, 0);

/**
 * h on its nodes, linear between each two, a kink's station two nodes, h before its jump and after it, the piece
 * between them of no length: its value at a node, and where it crosses a level within a piece.
 */
class Pieces {
  constructor(
    readonly nodes: readonly number[],
    readonly values: readonly number[],
    readonly h: (s: number) => number,
  ) {}
  get last() {
    return this.nodes.length - 1;
  }
  value(i: number) {
    return this.values[i]!;
  }
  /** The first node at or after `s`, and the last at or before it. */
  after(s: number) {
    const i = this.nodes.findIndex((x) => x >= s);
    return i < 0 ? this.last : i;
  }
  before(s: number) {
    let i = this.last;
    while (i > 0 && this.nodes[i]! > s) i--;
    return i;
  }
  /**
   * Where h rises across `c` on the piece from node `i` (h ≤ c there) to node `i + 1` (h > c there, or ≥ c): within it
   * where its line meets c, or at node `i + 1` where h jumps across c there.
   */
  crossing(i: number, c: number) {
    const [x0, v0, slope] = this.#line(i);
    if (this.end(i) <= c || slope <= 0) return this.nodes[i + 1]!;
    return Math.min(this.nodes[i + 1]!, Math.max(x0, x0 + (c - v0) / slope));
  }

  /** h's value at the end of the piece from node `i`, before any jump at node `i + 1`. */
  end(i: number) {
    const [x0, v0, slope] = this.#line(i);
    return v0 + slope * (this.nodes[i + 1]! - x0);
  }

  /** The line of the piece from node `i`: its start, its value there and its slope, from its value at its middle. */
  #line(i: number) {
    const [x0, x1] = [this.nodes[i]!, this.nodes[i + 1]!];
    const v0 = this.value(i);
    return [x0, v0, x1 === x0 ? 0 : (this.h((x0 + x1) / 2) - v0) / ((x1 - x0) / 2)] as const;
  }
}

/**
 * The stretch about nodes `[from, to]`: its level c, where the integral of h − c over [a(c), b(c)] is 0. a(c) is where
 * h last rises to c before the first node there above c (0 where h stays above c back to the start), b(c) where h first
 * rises to c after the last node there below c (the end where it stays below). The integral falls as c rises, so c is
 * found by bisection within h's range over the nodes.
 */
function solve(from: number, to: number, pieces: Pieces, integral: (a: number, b: number) => number): Stretch {
  const { nodes } = pieces;
  const ends = (c: number) => {
    let p = from;
    while (p < to && pieces.value(p) <= c) p++;
    let q = p;
    while (q > 0 && pieces.value(q) > c) q--;
    const a = pieces.value(q) > c ? 0 : q === p ? nodes[p]! : pieces.crossing(q, c);
    let r = to;
    while (r > from && pieces.value(r) >= c) r--;
    let t = r;
    while (t < pieces.last && pieces.value(t) < c) t++;
    const b = pieces.value(t) < c ? nodes[pieces.last]! : t === r ? nodes[r]! : pieces.crossing(t - 1, c);
    return { a, b };
  };
  const phi = (c: number) => {
    const { a, b } = ends(c);
    return integral(a, b) - c * (b - a);
  };
  // c lies within h's range over the nodes, its values at them and at its pieces' ends.
  const values = [pieces.value(from)];
  for (let i = from; i < to; i++) values.push(pieces.end(i), pieces.value(i + 1));
  let [lo, hi] = [Math.min(...values), Math.max(...values)];
  for (let i = 0; i < 200; i++) {
    const c = (lo + hi) / 2;
    if (c === lo || c === hi) break;
    if (phi(c) > 0) lo = c;
    else hi = c;
  }
  const c = (lo + hi) / 2;
  return { ...ends(c), c };
}

/** A change of grade of rounding's size, which a fixed point's mending leaves: no crest. */
const ROUNDING = 1e-12;

/**
 * The rule's guarantees, the conversion stopped where one fails: each stretch's ends keep the road's heights to a
 * micrometre, and no crest sharper than the radius is left, a kink down of rounding's size none.
 */
function check(road: Profile, laid: Profile, stretches: readonly Stretch[], fall: number, length: number) {
  for (const t of stretches)
    for (const s of [t.a, t.b])
      if (Math.abs(laid.height(s) - road.height(s)) > 1e-6)
        throw contractUnmet(`The crests rule moved the road's height at ${s} m`);
  if (Math.abs(laid.height(length) - road.height(length)) > 1e-6)
    throw contractUnmet("The crests rule moved the road's end");
  if (
    laid.bends.some((b) => b.curvature < -fall * (1 + 1e-9)) ||
    laid.kinks.some((k) => k.change < -ROUNDING && k.at > 0)
  )
    throw contractUnmet('The crests rule left a crest sharper than its radius');
}

/**
 * `road`, a closed lap `lap` metres long (its height and grade at `lap` its start's), kept within the crests' radius:
 * cut at its lowest point (the first from its start where two are lowest), laid as one road by `crestBound` and put back.
 * Exact: H(s) = ∫h = y(s) + s²/2R less a line is y(s) + (s − s_low)²/2R, least at s_low, so H's lower convex hull touches
 * it there and a stretch ends there: s_low does not move, and the lap's height and grade stay closed. `cut`, where the lap
 * is cut, is s_low but for a test that cuts it at another stretch's end.
 */
export function crestBoundLap(road: Profile, lap: number, radius: number, cut?: number, step = 0.5): Profile {
  const at = cut ?? heightExtremes(road, lap).lowest;
  const turned = turn(road, lap, at);
  const laid = crestBound(turned, lap, radius, step);
  return laid === turned ? road : turn(laid, lap, lap - at);
}

/**
 * The lap `road` begun at its station `at`: its bends and kinks moved back by `at` round the lap, a bend across `at`
 * broken there, its grade at `at` the start's (a kink at 0), its start's grade not a kink.
 */
function turn(road: Profile, lap: number, at: number): Profile {
  const moved = (s: number) => (((s - at) % lap) + lap) % lap;
  const bends: Bend[] = road.bends.flatMap((b) => {
    const [from, to] = [moved(b.from), moved(b.to) || lap];
    return from < to
      ? [{ from, to, curvature: b.curvature }]
      : [
          { from, to: lap, curvature: b.curvature },
          { from: 0, to, curvature: b.curvature },
        ].filter((p) => p.to > p.from);
  });
  const kinks: Kink[] = [
    ...road.kinks.filter((k) => k.at > 0 && k.at !== at).map((k) => ({ at: moved(k.at), change: k.change })),
    { at: 0, change: road.grade(at) },
  ].filter((k) => k.change !== 0);
  return profileOf(bends, [], kinks);
}

/**
 * A road's heights before the crests rule ([Original road data](../../../docs/original-road-data.md#profile)): the
 * original road's grades (`road`, its bends and kinks, a change running past either end left out), the mounds added
 * after the rule, its Sections' cuts, its length, and whether it closes on itself (a lap).
 */
export interface RoadHeights {
  readonly road: { readonly bends: readonly Bend[]; readonly kinks: readonly Kink[] };
  readonly mounds: { readonly bends: readonly Bend[]; readonly kinks: readonly Kink[] };
  readonly cuts: readonly number[];
  readonly length: number;
  readonly lap: boolean;
}

/** The crests' radius at `kmh`, metres: R = V²/g. */
export const crestRadius = (kmh: number) => (kmh / 3.6) ** 2 / VEHICLE_GRAVITY;

/** The original road's profile, its crests kept within the radius at `kmh` (as it is where `kmh` is null). */
export const crestedRoad = (heights: RoadHeights, kmh: number | null) =>
  bound(profileOf(heights.road.bends, [], heights.road.kinks), heights, kmh);

const bound = (original: Profile, { lap, length }: RoadHeights, kmh: number | null) =>
  kmh === null
    ? original
    : lap
      ? crestBoundLap(original, length, crestRadius(kmh))
      : crestBound(original, length, crestRadius(kmh));

/**
 * A road's profile, in the order the profile is laid: the original road, its crests kept within the radius at `kmh`
 * (none where `kmh` is null), its mounds, broken at its Sections' cuts. A road the rule leaves as it is keeps its own
 * bends as given, so that its profile is the one without the rule.
 */
export function laidProfile(heights: RoadHeights, kmh: number | null): Profile {
  const { road, mounds, cuts } = heights;
  const original = profileOf(road.bends, [], road.kinks);
  const crested = bound(original, heights, kmh);
  const laid = crested === original ? road : crested;
  return profileOf([...laid.bends, ...mounds.bends], cuts, [...laid.kinks, ...mounds.kinks]);
}

/** The stretches the crests rule laid on the road at `kmh` (`crestedRoad`): its bends falling at exactly 1/R. */
export const crestStretches = (crested: Profile, kmh: number) =>
  crested.bends.filter((b) => b.curvature === -1 / crestRadius(kmh));
