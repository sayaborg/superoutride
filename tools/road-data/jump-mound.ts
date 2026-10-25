import { halveRgb555 } from '../../src/image/rgb555.js';
import type { Kink } from './road-profile.js';

/**
 * A jump's or a dip's mound ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): metres
 * either side of its top, and its height.
 */
export interface Mound {
  readonly half: number;
  readonly height: number;
}

/** A stretch of a mound's slope, stations, facing the camera (rising) or away from it. */
export interface Slope {
  from: number;
  to: number;
  readonly facing: 'toward' | 'away';
}

/**
 * A road color on a slope (K, 2026-10-26): facing the camera brightened halfway to white, facing away at the shadow's
 * half brightness (`halveRgb555`).
 */
export const slopeColor = (rgb555: number, facing: 'toward' | 'away' | null) =>
  facing === 'toward' ? 0x7fff ^ halveRgb555(0x7fff ^ rgb555) : facing === 'away' ? halveRgb555(rgb555) : rgb555;

/**
 * `[a, b]` cut where `slopes` begin and end, `offset` before their stations, each piece with its slope's facing (or
 * null), in order.
 */
export function bySlope(a: number, b: number, slopes: readonly Slope[], offset = 0) {
  const cuts = [a, b];
  for (const t of slopes) for (const s of [t.from - offset, t.to - offset]) if (s > a && s < b) cuts.push(s);
  const sorted = [...new Set(cuts)].sort((x, y) => x - y);
  return sorted.slice(1).map((to, i) => {
    const from = sorted[i]!;
    const mid = (from + to) / 2 + offset;
    return { from, to, facing: slopes.find((t) => t.from < mid && mid < t.to)?.facing ?? null };
  });
}

/** A mound at station `top`. */
export interface PlacedMound extends Mound {
  readonly top: number;
}

/**
 * The kinks of `mounds` ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): each a
 * triangle on the road, a rise (a positive height) or a dip, the grade kinked at its foot, over its top and back at its
 * end; where they overlap the one farther from the road is taken (a rise's higher, a dip's lower), kinked where their
 * sides meet. Also its slopes, each facing the camera (rising) or away from it, how many runs of overlapping mounds
 * there are, how many mounds they join and the longest run's length, metres.
 */
export function moundKinks(mounds: readonly PlacedMound[]) {
  const sorted = [...mounds].sort((a, b) => a.top - b.top);
  const runs: PlacedMound[][] = [];
  for (const m of sorted) {
    const run = runs.at(-1);
    if (run && m.top - m.half < Math.max(...run.map((r) => r.top + r.half))) run.push(m);
    else runs.push([m]);
  }
  const kinks: Kink[] = [];
  const slopes: Slope[] = [];
  for (const run of runs) {
    // The envelope's corners: the feet, the tops and where two mounds' sides cross.
    const corners = new Set(run.flatMap((m) => [m.top - m.half, m.top, m.top + m.half]));
    for (const a of run)
      for (const b of run)
        if (a.top < b.top) {
          // a's falling side meets b's rising side, halfway between their tops where they are alike.
          const [sa, sb] = [a.height / a.half, b.height / b.half];
          corners.add((a.top + b.top) / 2 + (a.height - b.height + ((sa - sb) * (a.top - b.top)) / 2) / (sa + sb));
        }
    const stations = [...corners].sort((p, q) => p - q);
    // Between two corners the grade is the side of the mound farthest from the road there, or level where none is.
    const above = (m: PlacedMound, s: number) => m.height * Math.max(0, 1 - Math.abs(s - m.top) / m.half);
    const side = (s: number) => {
      const m = run.reduce((best, m) => (Math.abs(above(m, s)) > Math.abs(above(best, s)) ? m : best));
      return above(m, s) !== 0 ? (Math.sign(m.top - s) * m.height) / m.half : 0;
    };
    let grade = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const next = side((stations[i]! + stations[i + 1]!) / 2);
      if (next !== grade) kinks.push({ at: stations[i]!, change: next - grade });
      if (next !== 0) {
        const facing = next > 0 ? 'toward' : 'away';
        const last = slopes.at(-1);
        if (last && last.facing === facing && last.to === stations[i]) last.to = stations[i + 1]!;
        else slopes.push({ from: stations[i]!, to: stations[i + 1]!, facing });
      }
      grade = next;
    }
    if (grade !== 0) kinks.push({ at: stations.at(-1)!, change: -grade });
  }
  const joined = runs.filter((run) => run.length > 1);
  return {
    kinks,
    slopes,
    runs: joined.length,
    joined: joined.reduce((n, run) => n + run.length, 0),
    longest: Math.max(
      0,
      ...runs.map((run) => Math.max(...run.map((m) => m.top + m.half)) - Math.min(...run.map((m) => m.top - m.half))),
    ),
  };
}
