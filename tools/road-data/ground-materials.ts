/**
 * The materials beneath what lies on the ground ([Original road data](../../docs/original-road-data.md#lying-boards)):
 * a lying board is drawn as the original's picture, and its material lies beneath it as a colorless Strip: water from
 * a strip's waterline out to the ground's outer Boundary, a patch's under its foot.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';
import { SPRITE_SOURCE_TEXELS_PER_METER as TEXELS, type SpriteLodDocument } from '../../src/image/sprite.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';

/** The camera a piece is seen from: the camera definition's, its height and its distance behind the player. */
const EYE = { height: CAMERA_DEFINITION.height, behind: cameraDistance(CAMERA_DEFINITION) };

/**
 * Where on the ground the camera sees a picture's row `r` metres below its anchor: that many metres nearer than the
 * piece (beyond it for a negative `r`), `behind · r / (height + r)`.
 */
const rowNearer = (r: number) => (EYE.behind * r) / (EYE.height + r);

/** What lies on the ground as its board shows it: its whole master (index 0 transparent) and its anchor's height. */
export interface LyingPicture {
  readonly master: SpriteLodDocument;
  readonly anchorY: number;
}

/** Consecutive pieces of a strip: one reaching within this of the next, metres. */
const GAP = 16;
/** The water's material keeps this far inside the outer Boundary, metres. */
const OUTER_MARGIN = 1;
/** A waterline whose knots pass the format's bound keeps them within this, metres. */
const THINNING = 0.25;

/** A piece lying on the ground: its picture at station `s` and lateral `l`, its anchor's place. */
export interface LyingPiece {
  readonly s: number;
  readonly l: number;
  readonly picture: LyingPicture;
  /** A strip's pieces share its key and reach `outward` from the road, its edge the waterline; a patch has none. */
  readonly strip: { readonly key: string; readonly outward: 1 | -1 } | null;
  /** Its material, or null for none. */
  readonly material: string | null;
}

/** A material Strip: its stations, its edges (a Boundary's id or a lateral) and material. */
export interface MaterialStrip {
  readonly start: number;
  readonly end: number;
  readonly left: string | number;
  readonly right: string | number;
  readonly material: string;
}

/** A Boundary: its id and knots, station and lateral (metres). */
export interface MaterialBoundary {
  readonly id: string;
  readonly knots: readonly { readonly s: number; readonly l: number }[];
}

/** A picture's opaque rows and columns, first and last. */
function opaqueExtent({ master }: LyingPicture) {
  let top = master.height,
    bottom = -1,
    left = master.width,
    right = -1;
  master.levels[0]!.indices.forEach((k, i) => {
    if (!k) return;
    const [x, y] = [i % master.width, Math.floor(i / master.width)];
    [top, bottom, left, right] = [Math.min(top, y), Math.max(bottom, y), Math.min(left, x), Math.max(right, x)];
  });
  return { top, bottom, left, right };
}

/**
 * Where on the ground a piece's opaque rows lie, along the road: its top row's far edge and its bottom row's near edge,
 * as the camera sees them (`rowNearer`): its foot, `near`, and `far`.
 */
function footprint(piece: LyingPiece) {
  const { picture } = piece;
  const { top, bottom } = opaqueExtent(picture);
  return {
    near: piece.s - rowNearer((bottom + 0.5 - picture.anchorY) / TEXELS),
    far: piece.s - rowNearer((top - 0.5 - picture.anchorY) / TEXELS),
  };
}

/**
 * A Section's materials beneath its lying pieces, within `[0, length]`:
 * - a patch's, the rectangle of its foot: across its picture's opaque columns, along from where its bottom to where its
 *   top opaque row meets the ground;
 * - a strip's, from its waterline, a Boundary through each piece's edge at its foot, out to its side's outer Boundary,
 *   along from the first piece's foot to the last's of each run (pieces within `GAP` of the next), over each stretch
 *   where the waterline lies `OUTER_MARGIN` inside the outer Boundary (none beyond the course's limits). A side's runs
 *   share its Boundary, `water-<side>`, while they follow one another; its knots are thinned within `THINNING` where
 *   they pass the format's bound.
 */
export function lyingMaterials(
  pieces: readonly LyingPiece[],
  section: {
    readonly length: number;
    readonly outer: Readonly<Record<'left' | 'right', { readonly id: string; readonly at: (s: number) => number }>>;
  },
): { strips: MaterialStrip[]; boundaries: MaterialBoundary[] } {
  const strips: MaterialStrip[] = [];
  const clip = (a: number, b: number) => [Math.max(0, a), Math.min(section.length, b)] as const;
  const groups = new Map<string, LyingPiece[]>();
  // Each piece's footprint, found once.
  const feet = new Map(pieces.map((piece) => [piece, footprint(piece)]));
  const foot = (piece: LyingPiece) => feet.get(piece)!;
  for (const piece of pieces) {
    if (piece.material === null) continue;
    if (!piece.strip) {
      const { left, right } = opaqueExtent(piece.picture);
      const { near, far } = foot(piece);
      const [start, end] = clip(near, far);
      if (end - start > 1e-3)
        strips.push({
          start,
          end,
          left: piece.l + (left - 0.5 - piece.picture.master.anchorX) / TEXELS,
          right: piece.l + (right + 0.5 - piece.picture.master.anchorX) / TEXELS,
          material: piece.material,
        });
      continue;
    }
    const key = `${piece.strip.outward} ${piece.material}`;
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }
  const lines = new Map<string, { s: number; l: number; kept?: true }[]>();
  for (const group of groups.values()) {
    const { outward } = group[0]!.strip!;
    const side = outward > 0 ? 'right' : 'left';
    const outer = section.outer[side];
    const id = `water-${side}`;
    const sorted = [...group].sort((a, b) => foot(a).near - foot(b).near);
    const runs: LyingPiece[][] = [];
    let reach = -Infinity;
    for (const piece of sorted) {
      if (runs.length && foot(piece).near <= reach + GAP) runs.at(-1)!.push(piece);
      else {
        runs.push([piece]);
        reach = -Infinity;
      }
      reach = Math.max(reach, foot(piece).far);
    }
    const line = lines.get(id) ?? [];
    for (const run of runs) {
      // The waterline at each piece's foot, a later piece at one station replacing an earlier.
      const knots = new Map<number, number>();
      for (const piece of run) knots.set(foot(piece).near, piece.l);
      const at = [...knots].map(([s, l]) => ({ s, l })).sort((a, b) => a.s - b.s);
      const lateral = (s: number) => {
        const i = Math.max(
          1,
          Math.min(
            at.length - 1,
            at.findIndex((k) => k.s >= s),
          ),
        );
        const [a, b] = [at[i - 1] ?? at[0]!, at[i] ?? at[0]!];
        return b.s === a.s ? a.l : a.l + ((b.l - a.l) * (s - a.s)) / (b.s - a.s);
      };
      const [start, end] = clip(at[0]!.s, at.at(-1)!.s);
      if (end - start <= 1e-3) continue;
      // Within the Section: knots at its ends where the run passes them.
      const kept = [
        ...(start > at[0]!.s ? [{ s: start, l: lateral(start) }] : []),
        ...at.filter((k) => k.s >= start && k.s <= end),
        ...(end < at.at(-1)!.s ? [{ s: end, l: lateral(end) }] : []),
      ];
      line.push(...kept.map((k, i) => (i === 0 || i === kept.length - 1 ? { ...k, kept: true as const } : k)));
      const inside = (s: number) => outward * (outer.at(s) - lateral(s)) > OUTER_MARGIN;
      let from: number | null = null;
      const close = (to: number) => {
        if (from !== null && to - from > 1e-3)
          strips.push({
            start: from,
            end: to,
            ...(outward > 0 ? { left: id, right: outer.id } : { left: outer.id, right: id }),
            material: run[0]!.material!,
          });
        from = null;
      };
      kept.forEach((k, i) => {
        const next = kept[i + 1];
        const ok = inside(k.s) && (!next || inside((k.s + next.s) / 2));
        if (ok && from === null) from = k.s;
        if (!ok) close(k.s);
      });
      close(kept.at(-1)!.s);
    }
    lines.set(id, line);
  }
  const boundaries = [...lines].map(([id, knots]) => ({ id, knots: thinned(knots) }));
  return { strips, boundaries };
}

/**
 * Knots within the format's bound: as they are, or kept within `THINNING` of the others (Douglas–Peucker), each run's
 * first and last (`kept`) among them.
 */
function thinned(knots: readonly { s: number; l: number; kept?: true }[]): { s: number; l: number }[] {
  const sorted = [...knots]
    .sort((a, b) => a.s - b.s)
    .filter((k, i, all) => i === 0 || k.s > all[i - 1]!.s + 1e-6)
    .map(({ s, l, kept }) => ({ s, l, kept }));
  if (sorted.length <= COURSE_DOCUMENT_LIMITS.knots) return sorted.map(({ s, l }) => ({ s, l }));
  const keep = new Set([0, sorted.length - 1, ...sorted.flatMap((k, i) => (k.kept ? [i] : []))]);
  const split = (a: number, b: number) => {
    let worst = -1,
      at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (sorted[i]!.s - sorted[a]!.s) / (sorted[b]!.s - sorted[a]!.s);
      const d = Math.abs(sorted[i]!.l - (sorted[a]!.l + (sorted[b]!.l - sorted[a]!.l) * t));
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > THINNING) {
      keep.add(at);
      split(a, at);
      split(at, b);
    }
  };
  const fixed = [...keep].sort((a, b) => a - b);
  fixed.slice(1).forEach((b, i) => split(fixed[i]!, b));
  const out = sorted.filter((_, i) => keep.has(i)).map(({ s, l }) => ({ s, l }));
  if (out.length > COURSE_DOCUMENT_LIMITS.knots)
    throw new RangeError(`A waterline keeps ${out.length} knots within ${THINNING} m, past the format's bound`);
  return out;
}
