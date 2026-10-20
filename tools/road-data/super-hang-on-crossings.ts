/**
 * Where a level SUPER HANG-ON course passes over itself ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * its passages kept apart by bumps, every passage of a clump of crossing passages at a level of its own.
 */
import { RENDER_FAR_DEPTH_METERS } from '../../src/view/camera.js';
import { bendOf, LOOK_ROWS, profileOf, roadTopRow, type Change, type Profile } from './outrun-profile.js';

/** The height crossing passages are kept apart, metres. */
export const CLEARANCE = 6;
/** A bump's shortest half: it grows by `GROWTH` until the road's top moves by at most `LOOK_ROWS` on the screen. */
const SHORTEST = 100;
const GROWTH = 20;
/** A clump keeps its smooth bumps where they need at most this much more rise than its levels give. */
const SMOOTH_RISE = 1.1;

/** A passage: the stretch of road stations where the road overlaps another passage of it. */
export interface Passage {
  readonly from: number;
  readonly to: number;
}

/**
 * The passages of overlapping pairs of stations (`pairs`, each earlier then later, `step` metres of road each), and which
 * cross which: a passage is a run of the stations taking part, broken where a gap of more than `gap` metres opens.
 */
export function passagesOf(pairs: readonly (readonly [number, number])[], step: number, gap: number) {
  const stations = [...new Set(pairs.flat())].sort((a, b) => a - b);
  const passages: { from: number; to: number }[] = [];
  for (const s of stations) {
    const last = passages.at(-1);
    if (last && s - last.to <= gap) last.to = s + step;
    else passages.push({ from: s, to: s + step });
  }
  const of = (s: number) => passages.findIndex((p) => s >= p.from && s < p.to);
  const crosses = new Set<string>();
  for (const [a, b] of pairs) crosses.add(`${of(a)},${of(b)}`);
  return {
    passages: passages as Passage[],
    crosses: [...crosses].map((key) => key.split(',').map(Number) as [number, number]),
  };
}

/**
 * The clumps of crossing passages and each passage's level: the passages joined by crossings make a clump; in the
 * order the road runs them, each passage takes the lowest level no passage it crosses already holds. A passage's height
 * is its level less its clump's mean level, times `CLEARANCE`.
 */
export function passageLevels(passages: readonly Passage[], crosses: readonly (readonly [number, number])[]) {
  const neighbours = passages.map(() => new Set<number>());
  for (const [p, q] of crosses) {
    neighbours[p]!.add(q);
    neighbours[q]!.add(p);
  }
  const clump = passages.map(() => -1);
  let clumps = 0;
  passages.forEach((_, start) => {
    if (clump[start]! >= 0) return;
    const stack = [start];
    clump[start] = clumps;
    while (stack.length)
      for (const q of neighbours[stack.pop()!]!)
        if (clump[q]! < 0) {
          clump[q] = clumps;
          stack.push(q);
        }
    clumps++;
  });
  const level = passages.map(() => -1);
  passages.forEach((_, p) => {
    const held = new Set([...neighbours[p]!].map((q) => level[q]!).filter((l) => l >= 0));
    let l = 0;
    while (held.has(l)) l++;
    level[p] = l;
  });
  const height = passages.map((_, p) => {
    const members = passages.map((__, q) => q).filter((q) => clump[q] === clump[p]);
    const mean = members.reduce((sum, q) => sum + level[q]!, 0) / members.length;
    return (level[p]! - mean) * CLEARANCE;
  });
  return { clump, level, height, clumps };
}

/**
 * A bump of `rise` flat over stations `[a, b]`, rising over the `half` metres before `a` and falling over the `half`
 * after `b`, each half as two bends of opposite curvature (a smooth bump where `a` is `b`).
 */
export function bump(a: number, b: number, rise: number, half: number): Change[] {
  const g = (2 * rise) / half;
  return [
    { from: a - half, to: a - half / 2, change: g },
    { from: a - half / 2, to: a, change: -g },
    { from: b, to: b + half / 2, change: -g },
    { from: b + half / 2, to: b + half, change: g },
  ].filter((c) => c.to > c.from);
}

/** The most the road's top moves on this game's screen, at cameras from `from` to `to`, from `before` to `after`. */
function lookChange(before: Profile, after: Profile, from: number, to: number, end: number): number {
  let most = 0;
  for (let s = Math.max(0, from); s <= Math.min(to, end - 3); s += 2)
    most = Math.max(most, Math.abs(roadTopRow(after, s, end) - roadTopRow(before, s, end)));
  return most;
}

/**
 * Bumps that keep every crossing's passages `CLEARANCE` apart on a level road `end` metres long, overlapping pairs of
 * stations `pairs`, by clump: each passage moves to its height (`passageLevels`) by one bump. A clump's bumps are smooth,
 * at each passage's middle, their rise grown together until every pair is apart, where that takes at most `SMOOTH_RISE`
 * times the rise; else each is flat over its passage. A clump's bumps share their half, the shortest from `SHORTEST` by
 * `GROWTH` that moves the road's top by at most `LOOK_ROWS`, within the road and short of the next passage of the clump.
 */
export function crossingBumps(
  passages: readonly Passage[],
  crosses: readonly (readonly [number, number])[],
  pairs: readonly (readonly [number, number])[],
  end: number,
) {
  const { clump, height, level, clumps } = passageLevels(passages, crosses);
  const passageOf = (s: number) => passages.findIndex((p) => s >= p.from && s < p.to);
  let changes: Change[] = [];
  const report: { passages: Passage[]; levels: number[]; heights: number[]; half: number; smooth: boolean }[] = [];
  for (let c = 0; c < clumps; c++) {
    const members = passages.map((_, p) => p).filter((p) => clump[p] === c);
    const own = pairs.filter(([a]) => clump[passageOf(a)] === c);
    // Room: within the road, and short of the next passage of the clump.
    const ends = members.flatMap((p) => [passages[p]!.from, passages[p]!.to]).sort((x, y) => x - y);
    let reach = Math.min(ends[0]!, end - ends.at(-1)!);
    for (let i = 1; i + 1 < ends.length; i += 2) reach = Math.min(reach, (ends[i + 1]! - ends[i]!) / 2);
    const middle = (p: number) => (passages[p]!.from + passages[p]!.to) / 2;
    const bumps = (factor: number, half: number, smooth: boolean) =>
      members.flatMap((p) =>
        height[p] === 0
          ? []
          : smooth
            ? bump(middle(p), middle(p), factor * height[p]!, half)
            : bump(passages[p]!.from, passages[p]!.to, height[p]!, half),
      );
    const apart = (profile: Profile) =>
      Math.min(...own.map(([a, b]) => Math.abs(profile.height(a) - profile.height(b))));
    const before = profileOf(changes.map(bendOf));
    let half = Math.min(SHORTEST, reach);
    let factor = 1;
    const withBumps = (f: number, h: number, smooth: boolean) => profileOf([...changes, ...bumps(f, h, smooth)].map(bendOf));
    while (factor <= SMOOTH_RISE && apart(withBumps(factor, half, true)) < CLEARANCE - 1e-6) factor += 0.01;
    const smooth = factor <= SMOOTH_RISE;
    const f = smooth ? factor : 1;
    while (half + GROWTH <= reach) {
      const after = withBumps(f, half, smooth);
      const looks = members.map((p) =>
        lookChange(before, after, passages[p]!.from - half - RENDER_FAR_DEPTH_METERS, passages[p]!.to + half, end),
      );
      if (Math.max(...looks) <= LOOK_ROWS) break;
      half += GROWTH;
    }
    changes = [...changes, ...bumps(f, half, smooth)];
    report.push({
      passages: members.map((p) => passages[p]!),
      levels: members.map((p) => level[p]!),
      heights: members.map((p) => (smooth ? f : 1) * height[p]!),
      half,
      smooth,
    });
  }
  return { changes, report };
}
