/**
 * ENDURO RACER's objects as boards ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its unscaled size's drawn rows in every palette
 * it is shown in, on the texel grid by chosen lines, by the sprites' rules (scenery drawn with shadows allowed). The
 * pictures are the ROMs', provisional: the product draws its own.
 */
import { contractUnmet, romDiffers } from '../conversion-errors.js';
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { boardMaster, coloredColumns, SHADOW_PEN, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { readSpritePalette, sizeSetPixels } from './enduro-racer-sprites.js';
import { partsOnGrid, pictureParts, spriteTable, type ExtractPicture } from '../shared/sprite-rules.js';
import type { JumpKind } from './enduro-racer-scenery.js';
import { PIXEL_UNITS } from './enduro-racer-constants.js';

/**
 * One way an object shows a picture: its size set, mirrored or not, in a palette, and whether it stands, drawn with
 * shadows allowed, or floats a pixel or more (`floats`), its pen 10 a color.
 */
export interface PictureUse {
  readonly sizes: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly shades: boolean;
}
/** A picture's image name: `enduror-<size set, five hex digits>`, then whether mirrored. */
export const pictureName = (use: Pick<PictureUse, 'sizes' | 'mirrored'>) =>
  `enduror-${use.sizes.toString(16).padStart(5, '0')}${use.mirrored ? '-mirrored' : ''}`;

/**
 * The boards the uses need, at `unit` metres a lateral unit, with each one's colored width in metres: one a name,
 * carrying every palette it is shown in (the lowest its default), its pixels (a size set's drawn rows, a mirrored
 * picture the unmirrored one's mirrored) by chosen lines onto its texel grid, a pixel `PIXEL_UNITS` across and
 * `PIXEL_ASPECT` times that down at 40 texels/m, the lines chosen from the extract's pixels, pixel 10 among them. Its
 * base point is its middle on its base's bottom edge. No picture both stands and floats.
 */
export function enduroRacerBoards(main: Uint8Array, words: Uint32Array, uses: readonly PictureUse[], unit: number) {
  const sources = new Map<string, { source: ExtractPicture; palettes: Set<number>; shades: boolean }>();
  for (const use of uses) {
    const name = pictureName(use);
    if (!sources.has(name))
      sources.set(name, { source: sizeSetPixels(main, words, use.sizes), palettes: new Set(), shades: use.shades });
    const picture = sources.get(name)!;
    if (picture.shades !== use.shades) throw contractUnmet(`Picture ${name} both stands and floats`);
    picture.palettes.add(use.palette);
  }
  const texels = texelsAPixel(PIXEL_UNITS * unit);
  const table = spriteTable();
  const boards = [...sources]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, { source, palettes, shades }]) => {
      // A mirrored picture is the unmirrored one's lines mirrored.
      const mirrored = name.endsWith('-mirrored');
      const parts = pictureParts(source, shades, table.get(name.replace(/-mirrored$/, '')));
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      const anchor = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const sorted = [...palettes].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555.slice(1, 15), 0];
      const master = boardMaster(name, grid, turned(grid.indices, grid.width, mirrored), anchor, sorted, colors, {
        // The shadow frame on the picture's whole grid, its base point the picture's.
        ...(grid.shadow
          ? {
              shadow: {
                width: grid.width,
                height: grid.gridHeight,
                anchorX: anchor.x,
                anchorY: anchor.y,
                levels: [{ indices: turned(grid.shadow, grid.width, mirrored) }],
              },
            }
          : {}),
      });
      return {
        name,
        colored: coloredColumns(source.pixels, source.width) * PIXEL_UNITS * unit,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
      };
    });
  return boards;
}

/**
 * A jump kind's color ([Jumps and dips](../../../docs/original-road-data.md#profile)): the average of its size set's
 * pixels' colors in its palette, each channel rounded, the transparent (0 and 15) and the shadow's (10) aside (RGB555).
 */
export function jumpColor(main: Uint8Array, words: Uint32Array, kind: Pick<JumpKind, 'sizes' | 'palette'>) {
  const { pixels } = sizeSetPixels(main, words, kind.sizes);
  const palette = readSpritePalette(main, kind.palette).rgb555;
  const sums = [0, 0, 0];
  let count = 0;
  for (const v of pixels) {
    if (v === 0 || v === SHADOW_PEN || v === 15) continue;
    for (let c = 0; c < 3; c++) sums[c]! += (palette[v]! >> (5 * c)) & 31;
    count++;
  }
  if (!count) throw romDiffers(`The jump's picture 0x${kind.sizes.toString(16)} has no colored pixel`);
  return sums.reduce((rgb, sum, c) => rgb | (Math.round(sum / count) << (5 * c)), 0);
}
