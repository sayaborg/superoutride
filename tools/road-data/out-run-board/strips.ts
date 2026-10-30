/**
 * The originals' strips as boards ([Original road data](../../../docs/original-road-data.md#strips)), shared by OUTRUN's
 * and TURBO OUTRUN's: a looping strip's unit, its nearest size's colored columns, repeated away from the road, and one
 * that does not loop one wide picture from its nearest and farther sizes to the scenery's reach.
 */
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import type { SpriteLodDocument } from '../../../src/image/sprite.js';
import { boardMaster, turned } from '../shared/pixel-grid.js';
import { micrometre } from '../shared/section-writing.js';
import { anchorPoint, OUTRUN_SPRITES } from '../sega-16/sprite-pixels.js';
import { partsOnGrid, pictureParts, type ExtractPicture, type TableEntry } from '../shared/sprite-rules.js';
import { SHADOW_PEN } from '../sega-16/display.js';

/** A picture's colored columns: from its leftmost colored column to its rightmost, `[from, to)`. */
function coloredSpan({ width, pixels }: ExtractPicture): { readonly from: number; readonly to: number } {
  let [from, to] = [width, 0];
  for (let i = 0; i < pixels.length; i++)
    if (pixels[i]) [from, to] = [Math.min(from, i % width), Math.max(to, (i % width) + 1)];
  if (to <= from) throw romDiffers('A strip picture has no colored column');
  return { from, to };
}

/**
 * The shares of its nearest size's width the sizes of an OUTRUN family's strip are drawn at, the nearest last
 * ([OUTRUN road data](../../../docs/outrun-road-data.md#strips-and-patches)), the rule TURBO OUTRUN's strips take too: of
 * 16 sizes (the sea's, the sand's, the stones') size k is the nearest shrunk to (k + 1)/16; of 9 (VINEYARD's trees') to
 * k/8, size 0 too small to read.
 */
export const stripFractions = (sizes: 9 | 16): readonly number[] =>
  Object.freeze(Array.from({ length: sizes }, (_, k) => (sizes === 16 ? (k + 1) / 16 : k / 8)));

/** A strip's size and the share of its nearest size's width it is drawn at (1 the nearest). */
export interface StripSize {
  readonly picture: ExtractPicture;
  readonly fraction: number;
}

/**
 * A strip that does not loop as one picture `width` columns wide from its edge nearest the road (on the left), its
 * nearest size's rows high: each column `u` from the finest of `sizes` that reaches it, size k (the nearest shrunk to
 * its `fraction` f across, with what lies beyond it) reaching to its last colored column + 1 over f, its column ⌊u f⌋
 * and its rows stretched to the nearest's.
 */
export function wideStrip(sizes: readonly StripSize[], width: number): ExtractPicture {
  const finest = sizes.filter((s) => s.fraction > 0 && s.picture.height > 0).sort((a, b) => b.fraction - a.fraction);
  const nearest = finest[0];
  if (nearest?.fraction !== 1) throw romDiffers('A strip has no nearest size');
  const reach = finest.map(({ picture, fraction }) => coloredSpan(picture).to / fraction);
  const height = nearest.picture.height;
  const pixels = new Uint8Array(width * height);
  for (let u = 0; u < width; u++) {
    const k = reach.findIndex((r) => u < r);
    if (k < 0) continue;
    const { picture, fraction } = finest[k]!;
    const x = Math.floor(u * fraction);
    for (let y = 0; y < height; y++)
      pixels[y * width + u] = picture.pixels[Math.floor((y * picture.height) / height) * picture.width + x]!;
  }
  return { width, height, pixels };
}

/** How a strip is shown: mirrored or not, its original's anchor (across its edge nearest the road, left or right). */
export interface StripUse {
  readonly mirrored: boolean;
  readonly anchor: number;
}

/**
 * Where a strip shown as `use` reaches across from its edge nearest the road, metres: to its `nearest` size's last
 * colored column, `pixel` metres a column, away from the road.
 */
export function stripExtent(nearest: ExtractPicture, pixel: number, use: StripUse): readonly [number, number] {
  const reach = coloredSpan(nearest).to * pixel;
  return (use.anchor & 3) === 2 ? [-reach, 0] : [0, reach];
}

/**
 * A strip's board `name` from its `sizes` (its nearest's fraction 1), shown as `use`, by the sprites' rules
 * (`pictureParts`) on the texel grid of `texels` a pixel, `pixel` metres, in the palettes' `colors`: a looping one casts
 * no shadow, its pen 10 a color; any other as its use is drawn, with shadows allowed (`shadows`) or not.
 * A looping one (`loops`) is its nearest size's colored columns, repeating away from the road (`extend`) to the frame's
 * edge, its first unit where they stand in the original's picture; any other one wide picture (`wideStrip`) from its
 * edge to `reach` metres, in whole columns (the reach rounded to the micrometre). Its edge nearest the road, its original's anchor across (its left edge, or its right; on the
 * unmirrored picture the left), is the board's base point. It lies about its original's anchor down where K's `entry`
 * says so, stands on it where `entry`'s base is the anchor, its rows below lying on the nearer ground, and else stands
 * on its base.
 */
export function stripBoard(
  name: string,
  sizes: readonly StripSize[],
  shown: {
    readonly loops: boolean;
    readonly reach: number;
    readonly pixel: number;
    readonly texels: { readonly across: number; readonly down: number };
    readonly use: StripUse;
    readonly shadows: boolean;
    readonly entry: TableEntry | undefined;
  },
  palettes: readonly number[],
  colors: (palette: number) => readonly number[],
): SpriteLodDocument {
  const { loops, reach, pixel, texels, use, shadows, entry } = shown;
  const right = (use.anchor & 3) === 2;
  if (right !== use.mirrored) throw contractUnmet(`Strip ${name} reaches toward the road`);
  const nearest = sizes.find((s) => s.fraction === 1);
  if (!nearest) throw romDiffers(`Strip ${name} has no nearest size`);
  const { from, to } = coloredSpan(nearest.picture);
  const picture = loops
    ? {
        width: to - from,
        height: nearest.picture.height,
        pixels: Uint8Array.from({ length: (to - from) * nearest.picture.height }, (_, i) => {
          const w = to - from;
          return nearest.picture.pixels[Math.floor(i / w) * nearest.picture.width + from + (i % w)]!;
        }),
      }
    : wideStrip(sizes, Math.ceil((reach - 1e-6) / pixel));
  const parts = pictureParts(picture, !loops && shadows ? SHADOW_PEN : undefined, entry);
  const grid = partsOnGrid(picture, parts, texels.across, texels.down);
  // The edge on the unmirrored picture, the board's first column from it, and the base point as shown.
  const edge = -0.5 - (loops ? from : 0) * texels.across;
  const atAnchor = parts.lies || entry?.base === 'anchor';
  const point = {
    x: use.mirrored ? grid.width - 1 - edge : edge,
    y: atAnchor ? anchorPoint(use.anchor & 12, grid.width, grid.gridHeight, OUTRUN_SPRITES).y : grid.anchorY,
  };
  const shadow = grid.shadow && {
    width: grid.width,
    height: grid.gridHeight,
    anchorX: point.x,
    anchorY: point.y,
    levels: [{ indices: turned(grid.shadow, grid.width, use.mirrored) }],
  };
  return boardMaster(name, grid, turned(grid.indices, grid.width, use.mirrored), point, palettes, colors, {
    ...(loops ? { extend: right ? ('left' as const) : ('right' as const) } : {}),
    ...(parts.lies ? { lies: true as const } : {}),
    ...(shadow ? { shadow } : {}),
  });
}

/** One picture on the ground: its base point `lateral` metres right of P, `extent` its reach across from it. */
export interface GroundPicture {
  readonly lateral: number;
  readonly extent: readonly [number, number];
  /** The outermost lanes' edges left and right of P there, metres. */
  readonly edges: readonly [number, number];
}

/**
 * The scenery's reach beside an original's roads ([Original road data](../../../docs/original-road-data.md#strips)): how
 * far beyond the outermost lane's edge on its side the farthest of the pictures `standing` on the ground reaches,
 * metres. 0 with none beyond.
 */
export function sceneryReach(standing: Iterable<GroundPicture>): number {
  let most = 0;
  for (const { lateral, extent, edges } of standing)
    most = Math.max(most, -(lateral + extent[0]) - edges[0], lateral + extent[1] - edges[1]);
  return micrometre(most);
}
