/**
 * FINAL LAP 2's objects' pictures as course images ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)):
 * each kind's near layout's sprites in its color, its colors kept to 15 as a sky's tile's are, on the texel grid by
 * chosen lines and the sprites' rules (no shadows), its base point the slave's.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { keptColors, type Color } from '../../graphics/screen-pictures.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { boardMaster, coloredColumns, texelsAPixel } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts, type ExtractPicture } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../namco-system-2/display.js';
import { SPRITE_CLEAR, SPRITE_SIZE, spritePens } from '../namco-system-2/sprites.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { long, readPaletteLoad } from './final-lap-2-road.js';
import { objectLayout, underpassLayout, type ObjectLayout } from './final-lap-2-scenery.js';

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

/** The underpass's image name, by the slave's routine that draws it, 0x299A (its kind 0 is a scenery kind's too). */
export const UNDERPASS_NAME = 'finalap2-299a';

/**
 * A layout's picture of the extract (`what` naming it): its sprites (a word's bits 0 to 11 the sprite, its bit 12
 * mirrored), each in its color, the sprites' palette entries the color × 256 + the pen (the master's first palette
 * list, every set's), the clear pen transparent; its colors kept to `KEPT` (`keptColors`), indices 1 on in the order
 * they first appear. With its colors, how many it drew and the share of its pixels another color took.
 */
export function objectPicture(p: FinalLap2, layout: ObjectLayout, what: string) {
  const palettes = new Map<number, number[]>();
  const paletteOf = (color: number) =>
    palettes.get(color) ??
    palettes.set(color, [...readPaletteLoad(p, long(p.master, 0x37d4), 256 * color)]).get(color)!;
  const rows = layout.tiles.length;
  const columns = layout.tiles[0]!.length;
  const width = SPRITE_SIZE * columns;
  const height = SPRITE_SIZE * rows;
  const rgb = new Int32Array(width * height).fill(-1);
  layout.tiles.forEach((row, r) =>
    row.forEach((tile, k) => {
      if (tile === 0) return;
      if (tile & 0xe000) throw romDiffers(`${what}'s sprite word 0x${tile.toString(16)} has a flag beyond mirroring`);
      const palette = paletteOf(layout.colors?.[r]![k] ?? layout.color);
      const pens = spritePens(p.sprites, tile & 0xfff, (tile & 0x1000) !== 0);
      pens.forEach((pen, i) => {
        if (pen !== SPRITE_CLEAR)
          rgb[(SPRITE_SIZE * r + Math.floor(i / SPRITE_SIZE)) * width + SPRITE_SIZE * k + (i % SPRITE_SIZE)] =
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
 * The kinds' pictures as boards, and the underpass's where `underpass` (`UNDERPASS_NAME`), a source pixel `pixel`
 * metres across and `PIXEL_ASPECT` times that down: one a kind, its base point its layout's (its x from the left, its
 * row the bottom's less its y), with its colored width in metres and its colored columns' reach either side of its base
 * point (metres), how many colors it drew and the share of its pixels whose color another took.
 */
export function finalLap2Boards(p: FinalLap2, kinds: readonly number[], pixel: number, underpass = false) {
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const pictures: { kind: number | null; name: string; layout: ObjectLayout }[] = [
    ...[...new Set(kinds)]
      .sort((a, b) => a - b)
      .map((kind) => ({ kind, name: objectName(kind), layout: objectLayout(p, kind) })),
    ...(underpass ? [{ kind: null, name: UNDERPASS_NAME, layout: underpassLayout(p) }] : []),
  ];
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
