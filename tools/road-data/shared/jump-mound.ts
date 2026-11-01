import { halveRgb555 } from '../../../src/image/rgb555.js';
import type { Change, Kink } from './road-profile.js';

/**
 * A jump's or a dip's mound ([Original road data](../../../docs/original-road-data.md#profile), Jumps and dips): its face,
 * metres from its root to its crest (a dip's bottom), whose grade changes uniformly from `root` there to `crest` at the
 * crest (straight where they are equal); past its sharp crest the road comes back straight at grade `−crest`.
 */
export interface Mound {
  readonly face: number;
  readonly root: number;
  readonly crest: number;
}

/** A mound's height at its crest (negative: a dip's depth), and the metres back to the road past its crest. */
export const moundHeight = (m: Mound) => (m.face * (m.root + m.crest)) / 2;
export const moundBack = (m: Mound) => moundHeight(m) / m.crest;

/** A stretch of a mound's slope, stations, facing the camera (rising) or away from it, and its mound's index. */
export interface Slope {
  readonly from: number;
  readonly to: number;
  readonly facing: 'toward' | 'away';
  readonly mound: number;
}

/**
 * A road color on a slope (K, 2026-10-26): facing the camera brightened halfway to white, facing away at the shadow's
 * half brightness (`halveRgb555`).
 */
export const slopeColor = (rgb555: number, facing: 'toward' | 'away' | null) =>
  facing === 'toward' ? 0x7fff ^ halveRgb555(0x7fff ^ rgb555) : facing === 'away' ? halveRgb555(rgb555) : rgb555;

/**
 * `[a, b]` cut where `slopes` begin and end, `offset` before their stations, each piece with its slope and its facing
 * (or null), in order.
 */
export function bySlope<S extends Slope>(a: number, b: number, slopes: readonly S[], offset = 0) {
  const cuts = [a, b];
  for (const t of slopes) for (const s of [t.from - offset, t.to - offset]) if (s > a && s < b) cuts.push(s);
  const sorted = [...new Set(cuts)].sort((x, y) => x - y);
  return sorted.slice(1).map((to, i) => {
    const from = sorted[i]!;
    const mid = (from + to) / 2 + offset;
    const slope = slopes.find((t) => t.from < mid && mid < t.to) ?? null;
    return { from, to, slope, facing: slope?.facing ?? null };
  });
}

/** A mound with its crest at station `top`. */
export interface PlacedMound extends Mound {
  readonly top: number;
}

/**
 * A piece of a mound's height over `[from, to]`: `height + grade (s − from) + curvature (s − from)² / 2`, its mound's
 * crest at station `top`, `peak` high, its mound's index `mound`.
 */
interface Piece {
  readonly mound: number;
  readonly from: number;
  readonly to: number;
  readonly height: number;
  readonly grade: number;
  readonly curvature: number;
  readonly top: number;
  readonly peak: number;
}
const pieceHeight = (p: Piece, s: number) => p.height + (p.grade + (p.curvature * (s - p.from)) / 2) * (s - p.from);
const pieceGrade = (p: Piece, s: number) => p.grade + p.curvature * (s - p.from);

/** A mound's two pieces: its face, its curvature uniform from its root's grade, and the straight back past its crest. */
function pieces(m: PlacedMound, mound: number): readonly Piece[] {
  const [top, peak] = [m.top, moundHeight(m)];
  return [
    {
      mound,
      from: m.top - m.face,
      to: m.top,
      height: 0,
      grade: m.root,
      curvature: (m.crest - m.root) / m.face,
      top,
      peak,
    },
    { mound, from: m.top, to: m.top + moundBack(m), height: peak, grade: -m.crest, curvature: 0, top, peak },
  ];
}

/** Where pieces `p` and `q` meet strictly within both. */
function meetings(p: Piece, q: Piece): number[] {
  const [lo, hi] = [Math.max(p.from, q.from), Math.min(p.to, q.to)];
  if (!(lo < hi)) return [];
  if (p.curvature === 0 && q.curvature === 0 && p.grade !== q.grade) {
    // Two straight pieces, by their mounds' crests: halfway between where they are alike.
    const [a, b] = p.top < q.top ? [p, q] : [q, p];
    const [sa, sb] = [-a.grade, b.grade];
    const s = (a.top + b.top) / 2 + (a.peak - b.peak + ((sa - sb) * (a.top - b.top)) / 2) / (sa + sb);
    return s > lo && s < hi ? [s] : [];
  }
  // Their heights' difference as a quadratic in s − lo.
  const c = pieceHeight(p, lo) - pieceHeight(q, lo),
    b = pieceGrade(p, lo) - pieceGrade(q, lo),
    a = (p.curvature - q.curvature) / 2;
  const roots =
    a === 0
      ? b === 0
        ? []
        : [-c / b]
      : (() => {
          const d = b * b - 4 * a * c;
          return d < 0 ? [] : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
        })();
  return roots.map((x) => lo + x).filter((s) => s > lo && s < hi);
}

/**
 * The grades of `mounds` ([Original road data](../../../docs/original-road-data.md#profile), Jumps and dips), to add to a
 * profile: each face's uniform change of grade (`changes`, a bend of constant curvature) and its kinks (`kinks`) at its
 * root, over its crest and back at its end; where they overlap the one farther from the road is taken (a rise's higher,
 * a dip's lower), kinked where a face and a back meet. Also its slopes, each facing the camera (rising) or away from it,
 * each of the mound at its index in `mounds`, how many runs of overlapping mounds there are, how many mounds they join
 * and the longest run's length, metres.
 */
export function moundGrades(mounds: readonly PlacedMound[]) {
  // Runs of overlapping mounds, by their indices.
  const runs: number[][] = [];
  for (const k of [...mounds.keys()].sort((a, b) => mounds[a]!.top - mounds[b]!.top)) {
    const m = mounds[k]!;
    const run = runs.at(-1);
    if (run && m.top - m.face < Math.max(...run.map((r) => mounds[r]!.top + moundBack(mounds[r]!)))) run.push(k);
    else runs.push([k]);
  }
  const kinks: Kink[] = [];
  const changes: Change[] = [];
  // Built one stretch at a time, a stretch going on where the next is its own; published read-only.
  const slopes: { -readonly [K in keyof Slope]: Slope[K] }[] = [];
  for (const run of runs) {
    // The envelope's corners: the pieces' ends and where two mounds' pieces meet.
    const all = run.map((k) => pieces(mounds[k]!, k));
    const corners = new Set(all.flat().flatMap((p) => [p.from, p.to]));
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        for (const p of all[i]!) for (const q of all[j]!) for (const s of meetings(p, q)) corners.add(s);
    const stations = [...corners].sort((p, q) => p - q);
    // Between two corners the piece farthest from the road there, or none where the road is level.
    const farthest = (s: number) =>
      all
        .flat()
        .filter((p) => p.from <= s && s <= p.to)
        .reduce<Piece | null>(
          (best, p) => (!best || Math.abs(pieceHeight(p, s)) > Math.abs(pieceHeight(best, s)) ? p : best),
          null,
        );
    let grade = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const [from, to] = [stations[i]!, stations[i + 1]!];
      const piece = farthest((from + to) / 2);
      const start = piece ? pieceGrade(piece, from) : 0;
      if (start !== grade) kinks.push({ at: from, change: start - grade });
      if (piece && piece.curvature !== 0) changes.push({ from, to, change: piece.curvature * (to - from) });
      grade = piece ? pieceGrade(piece, to) : 0;
      const middle = piece ? pieceGrade(piece, (from + to) / 2) : 0;
      if (piece && middle !== 0) {
        const facing = middle > 0 ? 'toward' : 'away';
        const last = slopes.at(-1);
        if (last && last.facing === facing && last.mound === piece.mound && last.to === from) last.to = to;
        else slopes.push({ from, to, facing, mound: piece.mound });
      }
    }
    if (grade !== 0) kinks.push({ at: stations.at(-1)!, change: -grade });
  }
  const joined = runs.filter((run) => run.length > 1);
  return {
    kinks,
    changes,
    slopes,
    runs: joined.length,
    joined: joined.reduce((n, run) => n + run.length, 0),
    longest: Math.max(
      0,
      ...runs.map(
        (run) =>
          Math.max(...run.map((k) => mounds[k]!.top + moundBack(mounds[k]!))) -
          Math.min(...run.map((k) => mounds[k]!.top - mounds[k]!.face)),
      ),
    ),
  };
}
