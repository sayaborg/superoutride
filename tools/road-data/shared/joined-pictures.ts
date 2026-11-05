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
    const used = [...new Set(laid.owner)].filter((k) => k >= 0).sort((a, b) => a - b);
    const name = [...new Set(used.map((k) => pieces[k]![c]!.name))].join('+');
    if (name.length > NAME_UNITS) throw contractUnmet(`A joined palette's name ${name} is longer than ${NAME_UNITS}`);
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
