/**
 * Boards extending sideways from the originals' strip pictures that do not loop
 * ([Original road data](../../docs/original-road-data.md#strips)): a strip's nearest size, its edge nearest the road on the left, is cut into the shape of that edge, stood once, and
 * the part that repeats, whose two ends join; its transparent end columns and the shape of its outer end are not used.
 */
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { turned } from './pixel-grid.js';

/** Where a strip picture is cut, in its columns: its edge's shape `[start, repeat)` and the repeating part `[repeat, end)`. */
export interface StripCut {
  readonly start: number;
  readonly repeat: number;
  readonly end: number;
}

/** The columns either side of a seam that must continue as they do at the repeating part's first column. */
const SEAM = 8;

/**
 * The cut of a picture `width` wide (row-major `indices`, 0 transparent), its edge nearest the road on the left: its
 * transparent end columns left out; the repeating part `[repeat, end)` at least a quarter of the opaque width, whose
 * seam continues as the picture does about its first column. The `SEAM` columns before and after `end` are compared
 * with those about `repeat`: first their outline (each column's top and bottom opaque rows) the closest, then the most
 * equal texels, then the longest part, then the nearest the road. An end's shape, which nothing continues (a rise,
 * a tapering border), so stays out of the repeating part; the edge's shape is what lies before it.
 */
export function stripCut(indices: ArrayLike<number>, width: number): StripCut {
  const height = indices.length / width;
  const top = new Int32Array(width).fill(height),
    bottom = new Int32Array(width).fill(-1);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (indices[y * width + x]) {
        top[x] = Math.min(top[x]!, y);
        bottom[x] = y;
      }
  let start = 0,
    end = width;
  while (start < end && bottom[start]! < 0) start++;
  while (end > start && bottom[end - 1]! < 0) end--;
  const least = Math.ceil((end - start) / 4);
  if (end - start < least + 2 * SEAM + 1) throw new RangeError('A strip picture is too narrow to repeat');
  // Each pair of columns' outline difference and equal texels, summed along their diagonal over (a − j, b − j), j ≥ 0.
  const outline = new Int32Array(width * width),
    texels = new Int32Array(width * width);
  for (let a = start; a < end; a++)
    for (let b = a + 1; b < end; b++) {
      let n = 0;
      for (let y = 0; y < height; y++) if (indices[y * width + a] === indices[y * width + b]) n++;
      const before = a > start ? (a - 1) * width + b - 1 : -1;
      outline[a * width + b] =
        Math.abs(top[a]! - top[b]!) + Math.abs(bottom[a]! - bottom[b]!) + (before < 0 ? 0 : outline[before]!);
      texels[a * width + b] = n + (before < 0 ? 0 : texels[before]!);
    }
  const sum = (table: Int32Array, a: number, b: number) =>
    table[(a + SEAM - 1) * width + b + SEAM - 1]! - table[(a - SEAM - 1) * width + b - SEAM - 1]!;
  let best = { repeat: start, end, outline: Infinity, texels: -1 };
  for (let repeat = start + SEAM + 1; repeat + least <= end - SEAM; repeat++)
    for (let last = repeat + least; last <= end - SEAM; last++) {
      const o = sum(outline, repeat, last),
        n = sum(texels, repeat, last);
      if (
        o < best.outline ||
        (o === best.outline &&
          (n > best.texels ||
            (n === best.texels &&
              (last - repeat > best.end - best.repeat ||
                (last - repeat === best.end - best.repeat && repeat < best.repeat)))))
      )
        best = { repeat, end: last, outline: o, texels: n };
    }
  return { start, repeat: best.repeat, end: best.end };
}

/** Columns `[from, to)` of a picture `width` wide. */
export function pictureColumns<T>(indices: readonly T[], width: number, from: number, to: number): T[] {
  const height = indices.length / width;
  const out: T[] = [];
  for (let y = 0; y < height; y++) for (let x = from; x < to; x++) out.push(indices[y * width + x]!);
  return out;
}

/**
 * An extending board `master`, a strip's whole nearest size, cut (`stripCut`, on its picture as unmirrored): its edge's
 * shape, image `edgeName`, not extending, and the part that repeats, keeping its name and its way.
 */
export function cutBoard(master: SpriteLodDocument, edgeName: string) {
  const { extend, ...board } = master;
  const [level, ...more] = master.levels;
  if (!extend || more.length || master.shadow) throw new Error(`Board ${master.name} is no strip's whole picture`);
  const { width } = master;
  const mirrored = extend === 'left';
  const cut = stripCut(turned(level!.indices, width, mirrored), width);
  const part = (a: number, b: number): SpriteLodDocument => {
    const [from, to] = mirrored ? [width - b, width - a] : [a, b];
    return {
      ...board,
      width: to - from,
      anchorX: master.anchorX - from,
      levels: [{ ...level!, indices: pictureColumns(level!.indices, width, from, to) }],
    };
  };
  return {
    cut,
    edge: { ...part(cut.start, cut.repeat), name: edgeName },
    repeat: { ...part(cut.repeat, cut.end), extend },
  };
}
