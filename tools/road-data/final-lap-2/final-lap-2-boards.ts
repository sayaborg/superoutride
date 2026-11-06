/**
 * FINAL LAP 2's objects' pictures as course images ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)):
 * each kind's near layout's sprites in its color, its colors kept to 15 as a sky's tile's are, on the texel grid by
 * chosen lines and the sprites' rules (no shadows), its base point the slave's.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { keptColors, type Color } from '../../graphics/screen-pictures.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { boardMaster, chosenGrid, coloredColumns, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts, type ExtractPicture } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../namco-system-2/display.js';
import { SPRITE_CLEAR, SPRITE_SIZE, spritePens } from '../namco-system-2/sprites.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { long, readPaletteLoad } from './final-lap-2-road.js';
import { objectLayout, underpassLayout, type ObjectLayout } from './final-lap-2-scenery.js';
import { underpassGround } from './final-lap-2-bank.js';

/** A picture's colors kept, beside its transparent index 0: as a sky's tile's (`keptColors`). */
const KEPT = 15;

/** Where a picture's colored columns reach either side of its base point `x` (pixels from its left), metres. */
function reach(source: ExtractPicture, x: number, pixel: number): readonly [number, number] {
  let [lo, hi] = [Infinity, -Infinity];
  source.pixels.forEach((v, i) => {
    if (!v) return;
    [lo, hi] = [Math.min(lo, i % source.width), Math.max(hi, i % source.width)];
  });
  return [(lo - x) * pixel, (hi + 1 - x) * pixel];
}

/** A kind's image name: `finalap2-<its kind, three digits>`. */
export const objectName = (kind: number) => `finalap2-${String(kind).padStart(3, '0')}`;

const channels = (c: number): Color => [(c >> 10) & 31, (c >> 5) & 31, c & 31];

/**
 * The underpass's images: its sprites over its bank one thing of several pieces, named by its first drawn piece, the
 * bank the slave's 0x1CEE lays; the bank's band beyond its edges, by the same routine, its left one mirrored.
 */
export const UNDERPASS_NAMES = {
  joined: 'finalap2-joined-1cee',
  band: 'finalap2-1cee',
  mirrored: 'finalap2-1cee-mirrored',
} as const;

/** How far the underpass's band boards reach beside its sprites, pixels: a tile's columns times 16. */
const BAND_BESIDE = 16 * 8;

/**
 * A layout's picture of the extract (`what` naming it): its sprites (a word's bits 0 to 11 the sprite, its bit 12
 * mirrored), each in its color, the sprites' palette entries the color × 256 + the pen (the master's first palette
 * list, every set's), the clear pen transparent, over `ground` where given (RGB555 or −1, `beside` pixels wider either
 * side, the sprites' height); its colors kept to `KEPT` (`keptColors`), indices 1 on in the order they first appear.
 * With its colors, how many it drew and the share of its pixels another color took.
 */
export function objectPicture(
  p: FinalLap2,
  layout: ObjectLayout,
  what: string,
  ground?: { readonly rgb: Int32Array; readonly beside: number },
) {
  const palettes = new Map<number, number[]>();
  const paletteOf = (color: number) =>
    palettes.get(color) ??
    palettes.set(color, [...readPaletteLoad(p, long(p.master, 0x37d4), 256 * color)]).get(color)!;
  const rows = layout.tiles.length;
  const columns = layout.tiles[0]!.length;
  const beside = ground?.beside ?? 0;
  const width = SPRITE_SIZE * columns + 2 * beside;
  const height = SPRITE_SIZE * rows;
  const rgb = ground ? Int32Array.from(ground.rgb) : new Int32Array(width * height).fill(-1);
  if (rgb.length !== width * height) throw new Error(`${what}'s ground is not its picture's size`);
  layout.tiles.forEach((row, r) =>
    row.forEach((tile, k) => {
      if (tile === 0) return;
      if (tile & 0xe000) throw romDiffers(`${what}'s sprite word 0x${tile.toString(16)} has a flag beyond mirroring`);
      const palette = paletteOf(layout.colors?.[r]![k] ?? layout.color);
      const pens = spritePens(p.sprites, tile & 0xfff, (tile & 0x1000) !== 0);
      pens.forEach((pen, i) => {
        if (pen !== SPRITE_CLEAR)
          rgb[(SPRITE_SIZE * r + Math.floor(i / SPRITE_SIZE)) * width + beside + SPRITE_SIZE * k + (i % SPRITE_SIZE)] =
            palette[pen]!;
      });
    }),
  );
  const shown = [...rgb].filter((c) => c >= 0);
  const kept = keptColors(shown.map(channels), KEPT);
  const colors: number[] = [];
  const pixels = Uint8Array.from(rgb, (c) => {
    if (c < 0) return 0;
    const k = kept.get(c)!;
    let index = colors.indexOf(k);
    if (index < 0) index = colors.push(k) - 1;
    return index + 1;
  });
  const taken = shown.filter((c) => kept.get(c) !== c).length;
  return {
    source: { width, height, pixels } satisfies ExtractPicture,
    colors: [0, ...colors, ...new Array<number>(KEPT - colors.length).fill(0)],
    distinct: kept.size,
    replaced: shown.length ? taken / shown.length : 0,
    layout,
  };
}

/**
 * The kinds' pictures as boards, a source pixel `pixel` metres across and `PIXEL_ASPECT` times that down: one a kind,
 * its base point its layout's (its x from the left, its row the bottom's less its y), with its colored width in metres
 * and its colored columns' reach either side of its base point (metres), how many colors it drew and the share of its
 * pixels whose color another took.
 */
export function finalLap2Boards(p: FinalLap2, kinds: readonly number[], pixel: number) {
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const pictures = [...new Set(kinds)]
    .sort((a, b) => a - b)
    .map((kind) => ({ kind, name: objectName(kind), layout: objectLayout(p, kind) }));
  return pictures.map(({ kind, name, layout }) => {
    const { source, colors, distinct, replaced } = objectPicture(p, layout, name);
    const parts = pictureParts(source, undefined, {
      base: source.height - 1 - layout.y,
      reason: "the slave's layout's base point",
    });
    const grid = partsOnGrid(source, parts, texels.across, texels.down);
    const anchor = { x: (layout.x * grid.width) / source.width - 0.5, y: grid.anchorY };
    const master = boardMaster(name, grid, grid.indices, anchor, [0], () => colors);
    return {
      kind,
      name,
      colored: coloredColumns(source.pixels, source.width) * pixel,
      reach: reach(source, layout.x, pixel),
      width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
      distinct,
      replaced,
      image: courseImageFile(master),
    };
  });
}

/**
 * Course `c`'s underpass's boards (`UNDERPASS_NAMES`), a source pixel `pixel` metres across: its sprites as 0x299A
 * lays them over its bank (`underpassGround`) one picture, and the bank's band beyond the sprites' edges a board
 * extending sideways each way, the left one mirrored, all three laid on one texel grid by chosen lines and cut apart
 * at the sprites' edges, so that their rows agree and the bands' columns meet the picture's edges. Each band's anchor is
 * the picture's base point, outside the band (`anchorX`), and its bottom row the picture's. With the picture's colored
 * width and reach (metres), its colors, and its bank's heights.
 */
export function underpassBoards(p: FinalLap2, c: number, pixel: number) {
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const layout = underpassLayout(p);
  const width = SPRITE_SIZE * layout.tiles[0]!.length;
  const height = SPRITE_SIZE * layout.tiles.length;
  const { rgb, bank } = underpassGround(p, c, width, height, BAND_BESIDE);
  const { source, colors, distinct, replaced } = objectPicture(p, layout, UNDERPASS_NAMES.joined, {
    rgb,
    beside: BAND_BESIDE,
  });
  const parts = pictureParts(source, undefined, {
    base: source.height - 1 - layout.y,
    reason: "the slave's layout's base point",
  });
  const grid = partsOnGrid(source, parts, texels.across, texels.down);
  // The grid's columns, as `partsOnGrid` chose them: the sprites' from their left edge to their right.
  const { columns } = chosenGrid(source.pixels, source.width, texels.across, texels.down);
  const before = (x: number) => columns.filter((column) => column < x).length;
  const [left, right] = [before(BAND_BESIDE), before(BAND_BESIDE + width)];
  const point = before(BAND_BESIDE + layout.x);
  const slice = (from: number, to: number, top = 0) =>
    Array.from({ length: (grid.height - top) * (to - from) }, (_, k) => {
      const [y, x] = [top + Math.floor(k / (to - from)), from + (k % (to - from))];
      return grid.indices[y * grid.width + x]!;
    });
  const master = boardMaster(
    UNDERPASS_NAMES.joined,
    { width: right - left, height: grid.height },
    slice(left, right),
    { x: point - left - 0.5, y: grid.anchorY },
    [0],
    () => colors,
  );
  // The band: the right one's columns, from its first row holding a pixel; the left one its mirror.
  const band = slice(right, grid.width);
  const across = grid.width - right;
  let top = 0;
  while (top < grid.height && band.slice(top * across, (top + 1) * across).every((v) => !v)) top++;
  const rows = { width: across, height: grid.height - top };
  const bandIndices = slice(right, grid.width, top);
  if (bandIndices.some((v) => !v)) throw new Error("The underpass's band has a hole");
  const bands = [
    boardMaster(
      UNDERPASS_NAMES.band,
      rows,
      bandIndices,
      { x: point - right - 0.5, y: grid.anchorY - top },
      [0],
      () => colors,
      {
        extend: 'right',
      },
    ),
    boardMaster(
      UNDERPASS_NAMES.mirrored,
      rows,
      turned(bandIndices, across, true),
      { x: across + point - left - 0.5, y: grid.anchorY - top },
      [0],
      () => colors,
      { extend: 'left' },
    ),
  ];
  const sprites = {
    width,
    height,
    pixels: source.pixels.filter((_, i) => i % source.width >= BAND_BESIDE && i % source.width < BAND_BESIDE + width),
  };
  return {
    name: UNDERPASS_NAMES.joined,
    colored: coloredColumns(sprites.pixels, width) * pixel,
    reach: reach(sprites, layout.x, pixel),
    width: (right - left) / SPRITE_SOURCE_TEXELS_PER_METER,
    distinct,
    replaced,
    image: courseImageFile(master),
    bands: bands.map((b) => ({
      name: b.name,
      width: b.width / SPRITE_SOURCE_TEXELS_PER_METER,
      image: courseImageFile(b),
    })),
    layout,
    bank: { band: bank.bandHeight, window: bank.windowHeight + 8 },
    /** The picture's pixels and base point, for the passage's steps. */
    source: sprites,
  };
}
