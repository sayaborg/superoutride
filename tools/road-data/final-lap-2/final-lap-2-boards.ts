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
import { objectLayout } from './final-lap-2-scenery.js';

/** A picture's colors kept, beside its transparent index 0: as a sky's tile's (`keptColors`). */
const KEPT = 15;

/** A kind's image name: `finalap2-<its kind, three digits>`. */
export const objectName = (kind: number) => `finalap2-${String(kind).padStart(3, '0')}`;

const channels = (c: number): Color => [(c >> 10) & 31, (c >> 5) & 31, c & 31];

/**
 * Kind `kind`'s picture of the extract: its layout's sprites (a word's bits 0 to 11 the sprite, its bit 12 mirrored),
 * in its color, the sprites' palette entries the color × 256 + the pen (the master's first palette list, every set's),
 * the clear pen transparent; its colors kept to `KEPT` (`keptColors`), indices 1 on in the order they first appear. With
 * its colors, how many it drew and the share of its pixels another color took.
 */
export function objectPicture(p: FinalLap2, kind: number) {
  const layout = objectLayout(p, kind);
  const palette = readPaletteLoad(p, long(p.master, 0x37d4), 256 * layout.color);
  const rows = layout.tiles.length;
  const columns = layout.tiles[0]!.length;
  const width = SPRITE_SIZE * columns;
  const height = SPRITE_SIZE * rows;
  const rgb = new Int32Array(width * height).fill(-1);
  layout.tiles.forEach((row, r) =>
    row.forEach((tile, k) => {
      if (tile === 0) return;
      if (tile & 0xe000)
        throw romDiffers(`Kind ${kind}'s sprite word 0x${tile.toString(16)} has a flag beyond mirroring`);
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
 * The kinds' pictures as boards, a source pixel `pixel` metres across and `PIXEL_ASPECT` times that down: one a kind,
 * its base point its layout's (its x from the left, its row the bottom's less its y), with its colored width in metres,
 * how many colors it drew and the share of its pixels whose color another took.
 */
export function finalLap2Boards(p: FinalLap2, kinds: readonly number[], pixel: number) {
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  return [...new Set(kinds)]
    .sort((a, b) => a - b)
    .map((kind) => {
      const name = objectName(kind);
      const { source, colors, distinct, replaced, layout } = objectPicture(p, kind);
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
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct,
        replaced,
        image: courseImageFile(master),
      };
    });
}
