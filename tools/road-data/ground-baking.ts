/**
 * Baking what an original draws lying on the ground into Strips ([Original road data](../../docs/original-road-data.md#baking)):
 * a piece's picture, a board seen standing at its station, is laid on the ground as the camera sees it pass beside the
 * player. Its columns keep their laterals; each row moves into depth by where that camera's eye sees it on the ground.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';
import { SPRITE_SOURCE_TEXELS_PER_METER as TEXELS } from '../../src/image/sprite.js';
import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';

/** The camera a piece is seen from: the camera definition's, its height and its distance behind the player. */
const EYE = { height: CAMERA_DEFINITION.height, behind: cameraDistance(CAMERA_DEFINITION) };

/**
 * Where on the ground the camera sees a picture's row `r` metres below its anchor: that many metres nearer than the
 * piece (beyond it for a negative `r`), `behind · r / (height + r)`.
 */
export const rowNearer = (r: number) => (EYE.behind * r) / (EYE.height + r);

/** A picture to bake: its texels' RGB555 colors row by row (null transparent) and its anchor, texel centres. */
export interface BakePicture {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly colors: readonly (number | null)[];
}

/** A piece: its picture standing at station `s` (metres) and lateral `l`, its anchor's place, in drawing order. */
export interface BakePiece {
  readonly s: number;
  readonly l: number;
  readonly picture: BakePicture;
}

/** A Strip baked: its stations, its edges (a Boundary's id, a number, or null to the ground's edge), color, material. */
export interface BakedStrip {
  readonly start: number;
  readonly end: number;
  readonly left: string | number | null;
  readonly right: string | number | null;
  readonly color: number | null;
  readonly material: string | null;
}

/** A Boundary baked: its id and knots, station and lateral (metres). */
export interface BakedBoundary {
  readonly id: string;
  readonly knots: readonly { readonly s: number; readonly l: number }[];
}

/** A patch's footprint: the rectangle its picture's rows and columns cover on the ground, in the mean of its colors. */
export function bakePatch(piece: BakePiece, material: string | null): BakedStrip {
  const { picture } = piece;
  const far = rowNearer((-0.5 - picture.anchorY) / TEXELS),
    near = rowNearer((picture.height - 0.5 - picture.anchorY) / TEXELS);
  return {
    start: piece.s - near,
    end: piece.s - far,
    left: piece.l + (-0.5 - picture.anchorX) / TEXELS,
    right: piece.l + (picture.width - 0.5 - picture.anchorX) / TEXELS,
    color: meanColor(picture.colors.filter((c): c is number => c !== null)),
    material,
  };
}

/** An RGB555 color's linear channels. */
const linear = (c: number) => [(c >> 10) & 31, (c >> 5) & 31, c & 31].map(rgb555LinearChannel);

/** The mean of RGB555 colors, averaged in linear light. */
export function meanColor(colors: readonly number[]): number {
  let [r, g, b] = [0, 0, 0];
  for (const color of colors) {
    const [cr, cg, cb] = linear(color) as [number, number, number];
    [r, g, b] = [r + cr, g + cg, b + cb];
  }
  return linearToRgb555(r / colors.length, g / colors.length, b / colors.length);
}

/** A strip's options: how far it is sampled along s, its side, its bands, the Section and its water. */
export interface BakeOptions {
  /** +1 where the pieces reach right (higher l) from the road, −1 left. */
  readonly outward: 1 | -1;
  /** The Section's length: what lies beyond it is cut. */
  readonly length: number;
  /** The ids its Boundaries take: `${prefix}-edge`, `${prefix}-a1`, `${prefix}-b1`, and so on. */
  readonly prefix: string;
  /** The material the outermost class (the water) carries from the waterline out to `outer`, or null. */
  readonly material: string | null;
  /** The outer Boundary's id and its lateral at a station: the water's material ends there, and is cut where beyond. */
  readonly outer: { readonly id: string; readonly at: (s: number) => number };
}

/** Stations sampled along a strip, metres apart. */
const STEP = 0.5;
/**
 * Consecutive pieces of a strip: one reaching within this of the next, metres. The original brings a strip's pieces out
 * a few positions apart, each lying over about 6 m, so the gaps between them close: the strip's Boundaries run straight
 * across them.
 */
const GAP = 16;
/** Laterals a sample holds, a texel apart. */
const BIN = 1 / TEXELS;
/** A run of one class narrower than this is a fine pattern: it takes its neighbours' class. */
const FINE = 0.2;
/** The bands a strip keeps, the nearest first; a sample with more joins its farther ones to the last. */
const BANDS = 3;
/** Knots kept: a Boundary within this of its samples, metres, doubled until its knots fit the format's bound. */
const KNOT_TOLERANCE = 0.05;
/** The water's material keeps this far inside the outer Boundary, metres. */
const OUTER_MARGIN = 1;

/**
 * A strip's pieces, consecutive and on one side, baked: the pieces painted far to near (the nearer, which the original
 * draws later, on top) on samples `STEP` apart along s and a texel across; beyond a piece's outermost column, its color
 * reaches to the ground's edge. Each texel is light or dark (the two classes split at their luminance's largest gap);
 * the class the outermost columns mostly hold is the ground the others lie on, drawn from the pieces' edge out. Every
 * run of the other class at a sample is a band, the nearest first, up to `BANDS`; runs narrower than `FINE` take their
 * neighbours' class. The ground is one Strip from the edge outward, each band one Strip between its two Boundaries, in
 * the mean color of its class; with a material, the ground's class carries it from the waterline, where it first
 * appears, out to the outer Boundary, where that lies `OUTER_MARGIN` beyond.
 */
export function bakeStrip(
  pieces: readonly BakePiece[],
  options: BakeOptions,
): {
  strips: BakedStrip[];
  boundaries: BakedBoundary[];
  water: { readonly id: string; readonly start: number; readonly end: number } | null;
} {
  const { outward } = options;
  // The pieces' reach along s and across.
  const reach = pieces.map((p) => ({
    from: p.s - rowNearer((p.picture.height - 0.5 - p.picture.anchorY) / TEXELS),
    to: p.s - rowNearer((-0.5 - p.picture.anchorY) / TEXELS),
  }));
  const s0 = Math.max(0, Math.min(...reach.map((r) => r.from))),
    s1 = Math.min(options.length, Math.max(...reach.map((r) => r.to)));
  if (!(s1 - s0 > STEP)) return { strips: [], boundaries: [], water: null };
  // Outward from the road: a piece's columns' edges, the nearest and the farthest.
  const across = (p: BakePiece, x: number) => outward * (p.l + (x - p.picture.anchorX) / TEXELS);
  const edge = Math.min(...pieces.flatMap((p) => [across(p, -0.5), across(p, p.picture.width - 0.5)]));
  const far = Math.max(...pieces.flatMap((p) => [across(p, -0.5), across(p, p.picture.width - 0.5)])) + BIN;
  const bins = Math.ceil((far - edge) / BIN);
  const samples = Math.floor((s1 - s0) / STEP) + 1;
  const grid: (number | null)[] = new Array(samples * bins).fill(null);
  // Painted far to near: the nearer piece on top.
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b]!.s - pieces[a]!.s);
  for (const i of order) {
    const { s, picture } = pieces[i]!;
    for (let y = 0; y < picture.height; y++) {
      const a = s - rowNearer((y + 0.5 - picture.anchorY) / TEXELS),
        b = s - rowNearer((y - 0.5 - picture.anchorY) / TEXELS);
      const j0 = Math.max(0, Math.ceil((a - s0) / STEP)),
        j1 = Math.min(samples - 1, Math.floor((b - s0) / STEP));
      if (j1 < j0) continue;
      // The row's colors across, outward from the edge, its outermost one reaching on to the grid's end.
      const row: (number | null)[] = new Array(bins).fill(null);
      let last: number | null = null,
        lastBin = -1;
      for (let x = 0; x < picture.width; x++) {
        const color = picture.colors[y * picture.width + x]!;
        if (color === null) continue;
        const bin = Math.floor((across(pieces[i]!, x) - edge) / BIN);
        if (bin < 0 || bin >= bins) continue;
        row[bin] = color;
        if (bin > lastBin) [last, lastBin] = [color, bin];
      }
      if (last !== null) for (let k = lastBin + 1; k < bins; k++) row[k] = last;
      for (let j = j0; j <= j1; j++) for (let k = 0; k < bins; k++) if (row[k] !== null) grid[j * bins + k] = row[k]!;
    }
  }
  // The two classes, split at the largest gap in the colors' luminances.
  const luminance = (c: number) => {
    const [r, g, b] = linear(c);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const used = [...new Set(grid.filter((c): c is number => c !== null))].sort((a, b) => luminance(a) - luminance(b));
  let split = 1;
  for (let i = 1; i < used.length; i++)
    if (luminance(used[i]!) - luminance(used[i - 1]!) > luminance(used[split]!) - luminance(used[split - 1]!))
      split = i;
  const light = new Set(used.slice(split));
  // The ground's class: the one the outermost bins mostly hold.
  let outerLight = 0,
    outerAll = 0;
  for (let j = 0; j < samples; j++) {
    const c = grid[j * bins + bins - 1];
    if (c === null || c === undefined) continue;
    outerAll++;
    if (light.has(c)) outerLight++;
  }
  const groundIsLight = outerLight * 2 > outerAll;
  const isBand = (c: number) => light.has(c) !== groundIsLight;
  // Each sample's painted span and its bands, fine runs taking their neighbours' class.
  const fine = Math.round(FINE / BIN);
  const rows = Array.from({ length: samples }, (_, j) => {
    const cells = grid.slice(j * bins, (j + 1) * bins);
    const first = cells.findIndex((c) => c !== null);
    if (first < 0) return null;
    const band = cells.map((c) => c !== null && isBand(c));
    const runs: [number, number, boolean][] = [];
    for (let k = first; k < bins; k++) {
      const v = band[k]!;
      if (runs.length && runs.at(-1)![2] === v) runs.at(-1)![1] = k + 1;
      else runs.push([k, k + 1, v]);
    }
    // Fine runs, from the narrowest, take their neighbours' class until none is left.
    for (;;) {
      let narrow = -1;
      for (let i = 0; i < runs.length; i++)
        if (
          runs[i]![1] - runs[i]![0] < fine &&
          (narrow < 0 || runs[i]![1] - runs[i]![0] < runs[narrow]![1] - runs[narrow]![0])
        )
          narrow = i;
      if (narrow < 0 || runs.length === 1) break;
      runs[narrow]![2] = !runs[narrow]![2];
      for (let i = runs.length - 1; i > 0; i--)
        if (runs[i]![2] === runs[i - 1]![2]) {
          runs[i - 1]![1] = runs[i]![1];
          runs.splice(i, 1);
        }
    }
    const bands = runs.filter((r) => r[2]).map(([a, b]) => [a, b] as [number, number]);
    // More bands than kept: the farther ones join the last.
    if (bands.length > BANDS)
      bands.splice(BANDS - 1, bands.length - BANDS + 1, [bands[BANDS - 1]![0], bands.at(-1)![1]]);
    const water = runs.find((r) => !r[2]);
    return { first, bands, water: water ? water[0] : bins };
  });
  const lateral = (bin: number) => outward * (edge + bin * BIN);
  // The knots of each Boundary at every painted sample, every band's whether a sample has it or not: a missing band
  // closes at the end of the band before it.
  const kept = BANDS;
  const series = new Map<string, { s: number; l: number }[]>();
  const add = (id: string, s: number, bin: number) => {
    if (!series.has(id)) series.set(id, []);
    series.get(id)!.push({ s, l: lateral(bin) });
  };
  const painted: number[] = [];
  rows.forEach((row, j) => {
    // A sample between pieces holds nothing: the Boundaries run straight across it.
    if (!row) return;
    const s = s0 + j * STEP;
    painted.push(j);
    add(`${options.prefix}-edge`, s, row.first);
    let at = row.first;
    for (let i = 0; i < kept; i++) {
      const band = row.bands[i] ?? [at, at];
      add(`${options.prefix}-a${i + 1}`, s, band[0]);
      add(`${options.prefix}-b${i + 1}`, s, band[1]);
      at = band[1];
    }
    add(`${options.prefix}-water`, s, row.water);
  });
  if (painted.length < 2) return { strips: [], boundaries: [], water: null };
  const start = s0 + painted[0]! * STEP,
    end = s0 + painted.at(-1)! * STEP;
  const colorsOf = (pick: (c: number) => boolean) => {
    const list: number[] = [];
    for (const c of grid) if (c !== null && pick(c)) list.push(c);
    return list;
  };
  const groundColors = colorsOf((c) => !isBand(c)),
    bandColors = colorsOf(isBand);
  // Edges in document order, left first: outward to the right the near edge is left.
  const span = (near: string | null, farther: string | null) =>
    outward > 0 ? { left: near, right: farther } : { left: farther, right: near };
  const strips: BakedStrip[] = [];
  if (groundColors.length)
    strips.push({
      start,
      end,
      ...span(`${options.prefix}-edge`, null),
      color: meanColor(groundColors),
      material: null,
    });
  if (bandColors.length)
    for (let i = 0; i < Math.max(0, ...rows.map((r) => r?.bands.length ?? 0)); i++)
      strips.push({
        start,
        end,
        ...span(`${options.prefix}-a${i + 1}`, `${options.prefix}-b${i + 1}`),
        color: meanColor(bandColors),
        material: null,
      });
  const boundaries = [...series].map(([id, knots]) => ({ id, knots }));
  // The water's material is laid once the Boundaries are kept (`waterMaterial`).
  const water = options.material ? { id: `${options.prefix}-water`, start, end } : null;
  return { strips, boundaries, water };
}

/**
 * The water's material, from the waterline (Boundary `water`, as kept) to the outer Boundary, over each stretch of
 * `[start, end]` where the waterline lies `OUTER_MARGIN` inside it at its knots and between them.
 */
function waterMaterial(
  water: { readonly id: string; readonly start: number; readonly end: number },
  knots: readonly { s: number; l: number }[],
  options: Pick<BakeOptions, 'outward' | 'material' | 'outer'>,
): BakedStrip[] {
  const { outward } = options;
  const span = (near: string, farther: string) =>
    outward > 0 ? { left: near, right: farther } : { left: farther, right: near };
  const inside = (s: number, l: number) => outward * (options.outer.at(s) - l) > OUTER_MARGIN;
  const strips: BakedStrip[] = [];
  const within = knots.filter((k) => k.s >= water.start && k.s <= water.end);
  let from: number | null = null;
  const close = (to: number) => {
    if (from !== null && to - from > STEP)
      strips.push({
        start: from,
        end: to,
        ...span(water.id, options.outer.id),
        color: null,
        material: options.material,
      });
    from = null;
  };
  within.forEach((k, i) => {
    const next = within[i + 1];
    const ok = inside(k.s, k.l) && (!next || inside((k.s + next.s) / 2, (k.l + next.l) / 2));
    if (ok && from === null) from = k.s;
    if (!ok) close(k.s);
  });
  close(within.at(-1)?.s ?? water.start);
  return strips;
}

/**
 * Boundaries sampled at the same stations, each kept within a tolerance of its samples between its knots
 * (Douglas–Peucker), every Boundary keeping the stations any of them needs: `KNOT_TOLERANCE`, doubled until they fit
 * the format's bound.
 */
function simplify(series: readonly (readonly { s: number; l: number }[])[]): { s: number; l: number }[][] {
  for (let tolerance = KNOT_TOLERANCE; ; tolerance *= 2) {
    const keep = new Uint8Array(series[0]!.length);
    for (const knots of series) simplified(knots, tolerance).forEach((k, i) => (keep[i] ||= k));
    if (keep.reduce((n, k) => n + k, 0) <= COURSE_DOCUMENT_LIMITS.knots)
      return series.map((knots) => knots.filter((_, i) => keep[i]));
  }
}

/** Which of `knots` a Boundary within `tolerance` of them keeps, its first and last among them. */
function simplified(knots: readonly { s: number; l: number }[], tolerance: number): Uint8Array {
  const keep = new Uint8Array(knots.length);
  keep[0] = keep[knots.length - 1] = 1;
  const stack: [number, number][] = [[0, knots.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1,
      most = tolerance;
    for (let i = a + 1; i < b; i++) {
      const t = (knots[i]!.s - knots[a]!.s) / (knots[b]!.s - knots[a]!.s);
      const off = Math.abs(knots[a]!.l + (knots[b]!.l - knots[a]!.l) * t - knots[i]!.l);
      if (off > most) [worst, most] = [i, off];
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([a, worst], [worst, b]);
  }
  return keep;
}

/** A piece of what lies on the ground: a patch's, baked alone, or a strip's, baked with the pieces of its strip. */
export interface GroundPiece extends BakePiece {
  /** A strip's pieces share its key (its picture and palette) and reach `outward` from the road; a patch has none. */
  readonly strip: { readonly key: string; readonly outward: 1 | -1 } | null;
  /** The material it carries: a patch's under its footprint, a strip's in its outermost class from the waterline. */
  readonly material: string | null;
}

/**
 * A Section's ground pieces baked: each patch a Strip of its footprint (`bakePatch`), and each strip's consecutive
 * pieces on one side (each reaching within `GAP` of the next) baked together (`bakeStrip`). The strips on one side take
 * one set of Boundaries while they follow one another, `ground-<side>-<set>-…`, another set where one overlaps another.
 * `outer` gives each side's outer Boundary, where a strip's material ends.
 */
export function bakeGround(
  pieces: readonly GroundPiece[],
  section: {
    readonly length: number;
    readonly outer: Readonly<Record<'left' | 'right', BakeOptions['outer']>>;
  },
): { strips: BakedStrip[]; boundaries: BakedBoundary[] } {
  const strips: BakedStrip[] = [];
  const knots = new Map<string, { s: number; l: number }[]>();
  const groups = new Map<string, GroundPiece[]>();
  for (const piece of pieces) {
    if (!piece.strip) {
      const patch = bakePatch(piece, piece.material);
      const [start, end] = [Math.max(0, patch.start), Math.min(section.length, patch.end)];
      if (end - start > 1e-3) strips.push({ ...patch, start, end });
      continue;
    }
    const key = `${piece.strip.key} ${piece.strip.outward}`;
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }
  // Each side's sets of Boundaries, by where their last knot stands.
  const sets: Record<'left' | 'right', number[]> = { left: [], right: [] };
  const runs: GroundPiece[][] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.s - b.s);
    const near = (p: BakePiece) => p.s - rowNearer((p.picture.height - 0.5 - p.picture.anchorY) / TEXELS);
    const far = (p: BakePiece) => p.s - rowNearer((-0.5 - p.picture.anchorY) / TEXELS);
    let run: GroundPiece[] = [];
    for (const piece of sorted) {
      if (run.length && near(piece) > Math.max(...run.map(far)) + GAP) {
        runs.push(run);
        run = [];
      }
      run.push(piece);
    }
    if (run.length) runs.push(run);
  }
  runs.sort((a, b) => a[0]!.s - b[0]!.s);
  const waters: { water: { id: string; start: number; end: number }; options: BakeOptions }[] = [];
  for (const run of runs) {
    const { outward } = run[0]!.strip!;
    const side = outward > 0 ? 'right' : 'left';
    const start = Math.min(...run.map((p) => p.s - rowNearer((p.picture.height - 0.5 - p.picture.anchorY) / TEXELS)));
    let set = sets[side].findIndex((last) => last < start - STEP);
    if (set < 0) set = sets[side].push(-Infinity) - 1;
    const options: BakeOptions = {
      outward,
      length: section.length,
      prefix: `ground-${side}-${set + 1}`,
      material: run[0]!.material,
      outer: section.outer[side],
    };
    const baked = bakeStrip(run, options);
    if (baked.water) waters.push({ water: baked.water, options });
    for (const boundary of baked.boundaries)
      knots.set(boundary.id, [...(knots.get(boundary.id) ?? []), ...boundary.knots]);
    sets[side][set] = Math.max(sets[side][set]!, ...baked.boundaries.flatMap((b) => b.knots.map((k) => k.s)));
    strips.push(...baked.strips);
  }
  // Each set's Boundaries keep the same stations, so that one band's edges, ordered at every sample, stay ordered.
  const boundaries: BakedBoundary[] = [];
  const bySet = new Map<string, string[]>();
  for (const id of knots.keys()) {
    const set = id.slice(0, id.lastIndexOf('-'));
    bySet.set(set, [...(bySet.get(set) ?? []), id]);
  }
  for (const ids of bySet.values()) {
    const kept = simplify(ids.map((id) => knots.get(id)!));
    ids.forEach((id, i) => boundaries.push({ id, knots: kept[i]! }));
  }
  for (const { water, options } of waters)
    strips.push(...waterMaterial(water, boundaries.find((b) => b.id === water.id)!.knots, options));
  return { strips, boundaries };
}
