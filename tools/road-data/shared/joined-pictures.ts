/**
 * Things of several pieces ([Original road data](../../../docs/original-road-data.md#things-of-several-pieces)): one
 * thing an original draws in pieces, built again from the ROMs' pixels into one picture, its colors the pieces' pens
 * as its palette combinations show them.
 */
import { keptKeys, type Color } from '../../graphics/screen-pictures.js';
import { contractUnmet } from './conversion-errors.js';
import type { ExtractPicture } from './sprite-rules.js';

/** A picture's colors beside its transparent index 0, as a board's: 15. */
const KEPT = 15;

/** The longest palette name the course format admits (`idCodeUnits`). */
const NAME_UNITS = 128;

/**
 * A piece's colors in each of its thing's palette combinations: each its palette's name and its pens' colors (RGB555,
 * by pen).
 */
export type PieceColors = readonly { readonly name: string; readonly colors: readonly number[] }[];

/**
 * The pixels of a thing's pieces laid on one grid, each its pen and its piece (−1 none, the pieces in the order the
 * original draws them, a later one over those before).
 */
export interface LaidPieces {
  readonly width: number;
  readonly height: number;
  readonly pens: Uint8Array;
  readonly owner: Int16Array;
}

const channels = (c: number): Color => [(c >> 10) & 31, (c >> 5) & 31, c & 31];

/**
 * A joined palette combination's name: the names of the palettes of the pieces that show a pixel (`owner`), as they
 * first appear in drawing order, joined by `+`. A piece wholly covered names none.
 */
export function shownPaletteName(owner: Int16Array, names: readonly string[]) {
  const used = [...new Set(owner)].filter((k) => k >= 0).sort((a, b) => a - b);
  const name = [...new Set(used.map((k) => names[k]!))].join('+');
  if (name.length > NAME_UNITS) throw contractUnmet(`A joined palette's name ${name} is longer than ${NAME_UNITS}`);
  return name;
}

/**
 * A joined picture's colors: an index each (piece, pen) pair seen, pairs showing one color in every combination one
 * index, in the order they first appear; past `KEPT`, the pairs kept by `keptKeys` in the first combination's colors and
 * each other taking its kept pair's index. Each combination a palette, its name the names of the palettes its pieces
 * use, first appearing in drawing order, joined by `+`; the palettes in their names' order, the least first. With how
 * many colors it drew and the share of its pixels another's index took.
 */
export function joinedColors(laid: LaidPieces, pieces: readonly PieceColors[]) {
  const combinations = pieces[0]!.length;
  if (pieces.some((piece) => piece.length !== combinations))
    throw new Error("A thing's pieces do not share its palette combinations");
  // The pairs as they first appear, and one key each for its colors in every combination.
  const pair = (at: number) => laid.owner[at]! * 256 + laid.pens[at]!;
  const colorsOf = (key: number) => pieces[key >> 8]!.map((combination) => combination.colors[key & 255]!);
  const shown: number[] = [];
  for (let at = 0; at < laid.pens.length; at++) if (laid.owner[at]! >= 0 && laid.pens[at]) shown.push(pair(at));
  const same = new Map<string, number>();
  const kin = (key: number) => {
    const colors = JSON.stringify(colorsOf(key));
    if (!same.has(colors)) same.set(colors, key);
    return same.get(colors)!;
  };
  const kept = keptKeys(
    shown.map((key) => ({ key: kin(key), color: channels(colorsOf(kin(key))[0]!) })),
    KEPT,
  );
  const order: number[] = [];
  const pixels = new Uint8Array(laid.pens.length);
  laid.pens.forEach((pen, at) => {
    if (laid.owner[at]! < 0 || !pen) return;
    const key = kept.get(kin(pair(at)))!;
    let index = order.indexOf(key);
    if (index < 0) index = order.push(key) - 1;
    pixels[at] = index + 1;
  });
  const palettes = Array.from({ length: combinations }, (_, c) => {
    const name = shownPaletteName(
      laid.owner,
      pieces.map((piece) => piece[c]!.name),
    );
    const colors = [0, ...order.map((key) => colorsOf(key)[c]!)];
    return { name, colors: [...colors, ...new Array<number>(KEPT + 1 - colors.length).fill(0)] };
  }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (new Set(palettes.map((palette) => palette.name)).size !== palettes.length)
    throw contractUnmet(`Two of a joined picture's palette combinations are both named ${palettes[0]!.name}`);
  const taken = shown.filter((key) => kept.get(kin(key)) !== kin(key)).length;
  return {
    picture: { width: laid.width, height: laid.height, pixels } satisfies ExtractPicture,
    palettes,
    distinct: new Set(shown.map(kin)).size,
    replaced: shown.length ? taken / shown.length : 0,
  };
}

/**
 * One piece an original puts out, as a thing's joining reads it: what put it out at once (`unit`), its station, its
 * pens as drawn (mirrored as shown), a pixel's metres across (`pixel`) and up (`pixel` × `aspect`), its left edge's
 * lateral and its bottom edge's height (metres), whether it floats, whether it may join (no strip, lying picture,
 * movable object or picture shown off a chosen Link), and its place in the original's drawing order.
 */
export interface JoinPiece {
  readonly unit: string;
  readonly s: number;
  readonly pixels: ExtractPicture;
  readonly pixel: number;
  readonly aspect: number;
  readonly left: number;
  readonly bottom: number;
  readonly floats: boolean;
  readonly joins: boolean;
  readonly order: number;
}

/** How near along the road a unit's pieces stand to be one thing's candidates, metres. */
export const NEAR = 0.25;

/** How near a whole pixel a place is taken as it, the sums' rounding. */
const WHOLE = 1e-6;

/**
 * Pieces laid on one grid at the original's own size, its finest pixel (`fine`, metres across), each piece's pixel a
 * whole number of it (`times`); each piece's top left corner, grid pixels from the grid's (`x`, `y`), its place rounded
 * to the nearest (half right and up), with what was rounded (`off`, pixels) where it was; a laid pixel each its pen and
 * piece, the pieces in drawing order, a later one over those before.
 */
export interface Laid extends LaidPieces {
  readonly fine: number;
  readonly aspect: number;
  readonly places: readonly {
    readonly x: number;
    readonly y: number;
    readonly times: number;
    readonly off: readonly [number, number];
  }[];
  /** The grid's left edge's lateral and its top edge's height, metres. */
  readonly left: number;
  readonly top: number;
}

/** `pieces` laid at their places on one grid (`Laid`); pixels whose ratio is not whole stop the conversion. */
export function layPieces(pieces: readonly JoinPiece[]): Laid {
  const fine = Math.min(...pieces.map((p) => p.pixel));
  const aspect = pieces[0]!.aspect;
  if (pieces.some((p) => Math.abs(p.aspect - aspect) > WHOLE)) throw contractUnmet("A thing's pieces' aspects differ");
  const tops = pieces.map((p) => p.bottom + p.pixels.height * p.pixel * aspect);
  const left = Math.min(...pieces.map((p) => p.left));
  const top = Math.max(...tops);
  const places = pieces.map((p, k) => {
    const times = p.pixel / fine;
    if (Math.abs(times - Math.round(times)) > WHOLE)
      throw contractUnmet(`A thing's piece's pixel is ${times} of its finest, not a whole number`);
    const [x, y] = [(p.left - left) / fine, (top - tops[k]!) / (fine * aspect)];
    const [rx, ry] = [Math.floor(x + 0.5 + WHOLE), Math.ceil(y - 0.5 - WHOLE)];
    const off = [Math.abs(x - rx) > WHOLE ? x - rx : 0, Math.abs(y - ry) > WHOLE ? y - ry : 0] as const;
    return { x: rx, y: ry, times: Math.round(times), off };
  });
  const width = Math.max(...pieces.map((p, k) => places[k]!.x + p.pixels.width * places[k]!.times));
  const height = Math.max(...pieces.map((p, k) => places[k]!.y + p.pixels.height * places[k]!.times));
  const pens = new Uint8Array(width * height);
  const owner = new Int16Array(width * height).fill(-1);
  [...pieces.keys()]
    .sort((a, b) => pieces[a]!.order - pieces[b]!.order)
    .forEach((k) => {
      const { pixels } = pieces[k]!;
      const { x: x0, y: y0, times } = places[k]!;
      for (let y = 0; y < pixels.height * times; y++)
        for (let x = 0; x < pixels.width * times; x++) {
          const pen = pixels.pixels[Math.floor(y / times) * pixels.width + Math.floor(x / times)]!;
          if (!pen) continue;
          const at = (y0 + y) * width + x0 + x;
          [pens[at], owner[at]] = [pen, k];
        }
    });
  return { width, height, pens, owner, fine, aspect, places, left, top };
}

/**
 * Of `pieces`, the things of several pieces: within each unit, the pieces standing within `NEAR` of one another along
 * the road are candidates; of them, each floating piece and the pieces its colored pixels touch (overlapping or
 * neighbouring by side or corner, laid at the original's own size) are one thing, through every such touch. A thing of
 * two pieces or more, unless every piece stands at one station and one lateral; pieces that may not join, never.
 * Each thing its pieces' indices, in drawing order.
 */
export function joinedThings(pieces: readonly JoinPiece[]): number[][] {
  const units = new Map<string, number[]>();
  pieces.forEach((p, k) => {
    if (p.joins) units.set(p.unit, [...(units.get(p.unit) ?? []), k]);
  });
  const things: number[][] = [];
  for (const members of units.values()) {
    // Candidates: runs of the unit's pieces each within `NEAR` of the one before along the road.
    const sorted = [...members].sort((a, b) => pieces[a]!.s - pieces[b]!.s);
    const runs: number[][] = [];
    for (const k of sorted) {
      const run = runs.at(-1);
      if (run && pieces[k]!.s - pieces[run.at(-1)!]!.s <= NEAR) run.push(k);
      else runs.push([k]);
    }
    for (const run of runs) {
      if (run.length < 2 || !run.some((k) => pieces[k]!.floats)) continue;
      const laid = layPieces(run.map((k) => pieces[k]!));
      const parent = run.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
      const touch = (a: number, b: number) => {
        if (!pieces[run[a]!]!.floats && !pieces[run[b]!]!.floats) return;
        parent[find(a)] = find(b);
      };
      // Every pair of pieces whose colored pixels overlap or neighbour, of which one floats.
      const cover = run.map(() => new Uint8Array(laid.width * laid.height));
      run.forEach((k, i) => {
        const { pixels } = pieces[k]!;
        const { x: x0, y: y0, times } = laid.places[i]!;
        for (let y = 0; y < pixels.height * times; y++)
          for (let x = 0; x < pixels.width * times; x++)
            if (pixels.pixels[Math.floor(y / times) * pixels.width + Math.floor(x / times)])
              cover[i]![(y0 + y) * laid.width + x0 + x] = 1;
      });
      for (let a = 0; a < run.length; a++)
        for (let b = a + 1; b < run.length; b++) {
          if (find(a) === find(b)) continue;
          if (!pieces[run[a]!]!.floats && !pieces[run[b]!]!.floats) continue;
          const [ca, cb] = [cover[a]!, cover[b]!];
          search: for (let at = 0; at < ca.length; at++) {
            if (!ca[at]) continue;
            const [x, y] = [at % laid.width, Math.floor(at / laid.width)];
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const [u, v] = [x + dx, y + dy];
                if (u < 0 || u >= laid.width || v < 0 || v >= laid.height) continue;
                if (cb[v * laid.width + u]) {
                  touch(a, b);
                  break search;
                }
              }
          }
        }
      const groups = new Map<number, number[]>();
      run.forEach((k, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), k]));
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const [first] = group;
        const stacked = group.every(
          (k) =>
            Math.abs(pieces[k]!.s - pieces[first!]!.s) < WHOLE &&
            Math.abs(pieces[k]!.left - pieces[first!]!.left) < WHOLE,
        );
        if (!stacked) things.push(group.sort((a, b) => pieces[a]!.order - pieces[b]!.order));
      }
    }
  }
  return things;
}

/**
 * `laid` cropped to its colored columns and rows, with where the crop's top left corner lay on it (`x0`, `y0`) and its
 * left edge's lateral and top edge's height, metres.
 */
export function croppedPieces(laid: Laid): Laid & { readonly x0: number; readonly y0: number } {
  let [x0, x1, y0, y1] = [laid.width, -1, laid.height, -1];
  laid.owner.forEach((k, at) => {
    if (k < 0) return;
    const [x, y] = [at % laid.width, Math.floor(at / laid.width)];
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  });
  const [width, height] = [x1 - x0 + 1, y1 - y0 + 1];
  const pens = new Uint8Array(width * height);
  const owner = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    pens.set(laid.pens.subarray((y0 + y) * laid.width + x0, (y0 + y) * laid.width + x0 + width), y * width);
    owner.set(laid.owner.subarray((y0 + y) * laid.width + x0, (y0 + y) * laid.width + x0 + width), y * width);
  }
  return {
    ...laid,
    width,
    height,
    pens,
    owner,
    places: laid.places.map((p) => ({ ...p, x: p.x - x0, y: p.y - y0 })),
    left: laid.left + x0 * laid.fine,
    top: laid.top - y0 * laid.fine * laid.aspect,
    x0,
    y0,
  };
}
