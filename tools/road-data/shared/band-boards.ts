/**
 * A picture and the band it lies in ([Strips](../../../docs/original-road-data.md#strips)): one
 * picture of the extract on the texel grid by chosen lines, cut apart at the drawn picture's edges, so that their rows
 * agree and the band's columns meet the picture's edges.
 */
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../../src/image/sprite.js';
import { chosenGrid, namedBoardMaster, turned } from './pixel-grid.js';
import { partsOnGrid, type ExtractPicture, type PictureParts } from './sprite-rules.js';

/**
 * A band's images: the picture drawn once, the band beyond its edge (its right on both sides), and on both sides that
 * band mirrored (`mirrored`, which a band of one side has not).
 */
export interface BandNames {
  readonly picture: string;
  readonly band: string;
  readonly mirrored?: string;
}

/**
 * `source` (its parts `parts`) on one grid of `texels` a pixel, cut at its columns `edges`: the picture between them
 * drawn once, its base point the column edge `point` (source pixels from its left); and its bands, `sides`: on `both`,
 * the band beyond its right edge, from its first row holding a pixel to its last, a board extending right, and its
 * mirror a board extending left; on `right` that band alone; on `left` the band beyond its left edge, its own columns so
 * cut, a board extending left. Each band is anchored at the picture's base point, outside it, or, where its last row
 * lies above that point, at its own bottom edge, standing `rise` metres higher than the picture. All in `palettes`, each
 * its name and colors, the first the default. A band with a transparent texel is refused: it fills its plane.
 */
export function bandBoards(
  names: BandNames,
  source: ExtractPicture,
  parts: PictureParts,
  edges: readonly [number, number],
  point: number,
  texels: { readonly across: number; readonly down: number },
  palettes: readonly { readonly name: string; readonly colors: readonly number[] }[],
  sides: 'both' | 'left' | 'right' = 'both',
): {
  readonly picture: SpriteLodDocument;
  readonly bands: readonly SpriteLodDocument[];
  readonly rise: number;
} {
  const grid = partsOnGrid(source, parts, texels.across, texels.down);
  // The grid's columns, as `partsOnGrid` chose them: a source column each.
  const { columns } = chosenGrid(source.pixels, source.width, texels.across, texels.down);
  const before = (x: number) => columns.filter((column) => column < x).length;
  const [left, right] = edges.map(before) as [number, number];
  const at = before(point);
  const slice = (from: number, to: number, top = 0) =>
    Array.from({ length: (grid.height - top) * (to - from) }, (_, k) => {
      const [y, x] = [top + Math.floor(k / (to - from)), from + (k % (to - from))];
      return grid.indices[y * grid.width + x]!;
    });
  const picture = namedBoardMaster(
    names.picture,
    { width: right - left, height: grid.height },
    slice(left, right),
    { x: at - left - 0.5, y: grid.anchorY },
    palettes,
  );
  // The band: its columns beyond the edge, from its first row holding a pixel to its last; on both sides the left one
  // the right one's mirror.
  const [from, to] = sides === 'left' ? [0, left] : [right, grid.width];
  const band = slice(from, to);
  const across = to - from;
  const clear = (y: number) => band.slice(y * across, (y + 1) * across).every((v) => !v);
  let [top, bottom] = [0, grid.height];
  while (top < grid.height && clear(top)) top++;
  while (bottom > top && clear(bottom - 1)) bottom--;
  const rows = { width: across, height: bottom - top };
  const indices = slice(from, to, top).slice(0, rows.height * across);
  if (indices.some((v) => !v)) throw new Error(`${names.band} has a hole`);
  const anchorY = Math.min(grid.anchorY - top, rows.height - 0.5);
  const outward = namedBoardMaster(names.band, rows, indices, { x: at - from - 0.5, y: anchorY }, palettes, {
    extend: sides === 'left' ? 'left' : 'right',
  });
  if ((sides === 'both') !== (names.mirrored !== undefined))
    throw new Error(`${names.picture}'s mirrored band is named only on both sides`);
  const bands =
    names.mirrored !== undefined
      ? [
          outward,
          namedBoardMaster(
            names.mirrored,
            rows,
            turned(indices, across, true),
            { x: across + at - left - 0.5, y: anchorY },
            palettes,
            { extend: 'left' },
          ),
        ]
      : [outward];
  return { picture, bands, rise: (grid.anchorY - top - anchorY) / SPRITE_SOURCE_TEXELS_PER_METER };
}
