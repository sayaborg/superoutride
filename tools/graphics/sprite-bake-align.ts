import { rgb555LinearChannel } from '../../src/image/image-filter.js';
import { pieceEdge, type BakePiece } from './sprite-bake.js';

/** How far, in texels across and up, Align pieces looks from a piece's place, and how near two frames are neighbours. */
export const ALIGN_REACH = 4;
/** The fewest texel pairs a seam is judged by; a position comparing fewer is not chosen. */
export const ALIGN_LEAST_PAIRS = 10;

/** A seam between two neighbouring pieces: its mean color difference before and after aligning (null when unjudged). */
export interface PieceSeam {
  readonly pieces: readonly [number, number];
  readonly before: number | null;
  readonly after: number | null;
}

/** Each piece's move (texels, as K's arrow keys move it) and its seams. */
export interface PieceAlignment {
  readonly moves: readonly { readonly x: number; readonly y: number }[];
  readonly seams: readonly PieceSeam[];
}

type Point = { readonly x: number; readonly y: number };

/** A color's linear-light channels. */
const linear = (rgb555: number) => [
  rgb555LinearChannel((rgb555 >> 10) & 31),
  rgb555LinearChannel((rgb555 >> 5) & 31),
  rgb555LinearChannel(rgb555 & 31),
];

/**
 * Pieces moved where their seams match best, from where the original places them (each piece's `moved` is not read).
 * The largest piece (by its frame) stays; its neighbours (frames overlapping, or within `ALIGN_REACH` texels across or
 * up of each other while overlapping the other way) are placed from it outward, each at the move within
 * `ALIGN_REACH` texels across and up whose seams with the pieces placed already differ least: the mean linear-light
 * distance of the texel pairs compared, both opaque, positions with fewer than `ALIGN_LEAST_PAIRS` pairs not chosen and
 * the smaller move chosen on a tie. The pairs are the seam as drawn, a later piece over an earlier one: texels side
 * by side or one above the other of which one shows the one piece and the other the other, wherever their opaque edges
 * meet and whatever clear margin their frames have. A piece no neighbour reaches does not move.
 */
export function alignBakePieces(pieces: readonly BakePiece[]): PieceAlignment {
  const starts = pieces.map((piece) => pieceEdge({ ...piece, moved: { x: 0, y: 0 } }));
  const colors = pieces.map((piece) => piece.colors.map(linear));
  const slot = (i: number, x: number, y: number) => pieces[i]!.frame.indices[y * pieces[i]!.frame.width + x]!;
  const distance = (i: number, a: number, j: number, b: number) => {
    const [r1, g1, b1] = colors[i]![a]!,
      [r2, g2, b2] = colors[j]![b]!;
    return Math.hypot(r1! - r2!, g1! - g2!, b1! - b2!);
  };
  const box = (i: number, at: Point) => ({
    x0: at.x,
    y0: at.y,
    x1: at.x + pieces[i]!.frame.width,
    y1: at.y + pieces[i]!.frame.height,
  });
  /**
   * The summed distance and number of texel pairs across the seam of pieces i and j at `p` and `q` as they are drawn,
   * the later piece over the earlier: each two texels side by side or one above the other of which one shows i and
   * the other j. What the later piece covers is not seen and not compared.
   */
  const seam = (i: number, p: Point, j: number, q: Point) => {
    const a = box(i, p),
      b = box(j, q);
    // Pairs lie where the frames come within a texel of each other.
    const x0 = Math.max(a.x0, b.x0) - 1,
      x1 = Math.min(a.x1, b.x1) + 1,
      y0 = Math.max(a.y0, b.y0) - 1,
      y1 = Math.min(a.y1, b.y1) + 1;
    const cover = (k: number, at: Point, frame: ReturnType<typeof box>, x: number, y: number) =>
      x >= frame.x0 && x < frame.x1 && y >= frame.y0 && y < frame.y1 ? slot(k, x - at.x, y - at.y) : 0;
    // The slot shown at (x, y): positive for i's, negative for j's, 0 for none.
    const shown = (x: number, y: number) => {
      const s = cover(i, p, a, x, y),
        t = cover(j, q, b, x, y);
      return j > i ? (t ? -t : s) : s || -t;
    };
    let sum = 0,
      pairs = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const here = shown(x, y);
        if (!here) continue;
        for (const there of [shown(x + 1, y), shown(x, y + 1)]) {
          if (!there || here > 0 === there > 0) continue;
          sum += here > 0 ? distance(i, here, j, -there) : distance(i, there, j, -here);
          pairs++;
        }
      }
    return { sum, pairs };
  };
  const mean = ({ sum, pairs }: { sum: number; pairs: number }) => (pairs >= ALIGN_LEAST_PAIRS ? sum / pairs : null);
  const near = (i: number, j: number) => {
    const a = box(i, starts[i]!),
      b = box(j, starts[j]!);
    const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1),
      gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
    return (gapX <= ALIGN_REACH && gapY < 0) || (gapY <= ALIGN_REACH && gapX < 0);
  };
  const neighbours = pieces.map((_, i) => pieces.flatMap((_, j) => (j !== i && near(i, j) ? [j] : [])));
  const area = (i: number) => pieces[i]!.frame.width * pieces[i]!.frame.height;
  const largest = pieces.reduce((best, _, i) => (area(i) > area(best) ? i : best), 0);
  const moves: Point[] = pieces.map(() => ({ x: 0, y: 0 }));
  const at = (i: number, move: Point) => ({ x: starts[i]!.x + move.x, y: starts[i]!.y + move.y });
  const placedPieces = new Set([largest]);
  const queue = [largest];
  while (queue.length) {
    for (const j of neighbours[queue.shift()!]!) {
      if (placedPieces.has(j)) continue;
      const fixed = neighbours[j]!.filter((i) => placedPieces.has(i));
      let best: { move: Point; difference: number } | null = null;
      for (let y = -ALIGN_REACH; y <= ALIGN_REACH; y++)
        for (let x = -ALIGN_REACH; x <= ALIGN_REACH; x++) {
          const total = { sum: 0, pairs: 0 };
          for (const i of fixed) {
            const { sum, pairs } = seam(i, at(i, moves[i]!), j, at(j, { x, y }));
            total.sum += sum;
            total.pairs += pairs;
          }
          const difference = mean(total);
          if (difference === null) continue;
          const size = Math.abs(x) + Math.abs(y);
          if (
            !best ||
            difference < best.difference ||
            (difference === best.difference && size < Math.abs(best.move.x) + Math.abs(best.move.y))
          )
            best = { move: { x, y }, difference };
        }
      if (best) moves[j] = best.move;
      placedPieces.add(j);
      queue.push(j);
    }
  }
  const seams: PieceSeam[] = [];
  for (let i = 0; i < pieces.length; i++)
    for (const j of neighbours[i]!)
      if (j > i)
        seams.push({
          pieces: [i, j],
          before: mean(seam(i, starts[i]!, j, starts[j]!)),
          after: mean(seam(i, at(i, moves[i]!), j, at(j, moves[j]!))),
        });
  return { moves, seams };
}
