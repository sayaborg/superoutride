/**
 * ENDURO RACER's objects as boards ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its unscaled size's drawn rows in every palette
 * it is shown in, on the texel grid by chosen lines, its base point the middle of its bottom, its pixel 10 its shadow.
 * The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import {
  boardMaster,
  chosenLines,
  coloredColumns,
  footAnchorY,
  SHADOW_PEN,
  texelsAPixel,
  turned,
} from './pixel-grid.js';
import { readSpritePalette, sizeSetPixels } from './enduro-racer-sprites.js';

/** Lateral units an unscaled pixel spans: the hardware draws it at depth number 0x7F, where a unit is 125/128 pixels. */
export const PIXEL_UNITS = 128 / 125;
/** Pixel 10 is a shadow: scenery is drawn with shadows allowed, and it darkens what lies behind it. */
const SHADOW = SHADOW_PEN;

/** One way an object shows a picture: its size set, mirrored or not, in a palette, raised off the ground or not. */
export interface PictureUse {
  readonly sizes: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly raised: boolean;
}
/** A picture's image name: `enduror-<size set, five hex digits>`, then whether mirrored. */
export const pictureName = (use: Pick<PictureUse, 'sizes' | 'mirrored'>) =>
  `enduror-${use.sizes.toString(16).padStart(5, '0')}${use.mirrored ? '-mirrored' : ''}`;

/** A picture's source, unmirrored: its pixels, `width` wide. */
interface Source {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/**
 * The boards the uses need, at `unit` metres a lateral unit, with each one's colored width in metres: one a name,
 * carrying every palette it is shown in (the lowest its default), its pixels (a size set's drawn rows, a mirrored
 * picture the unmirrored one's mirrored) by chosen lines onto its texel grid, a pixel `PIXEL_UNITS` across and
 * `PIXEL_ASPECT` times that down at 40 texels/m, chosen once with pixel 10 among the colors: the board its other
 * pixels, its shadow its pixel 10. Its base point is its middle on its bottom edge.
 */
export function enduroRacerBoards(main: Uint8Array, words: Uint32Array, uses: readonly PictureUse[], unit: number) {
  const sources = new Map<string, { source: Source; palettes: Set<number>; ground: boolean; raised: boolean }>();
  const add = (name: string, source: () => Source, palette: number, raised: boolean) => {
    if (!sources.has(name)) sources.set(name, { source: source(), palettes: new Set(), ground: false, raised: false });
    const entry = sources.get(name)!;
    entry.palettes.add(palette);
    entry[raised ? 'raised' : 'ground'] = true;
  };
  for (const use of uses)
    add(
      pictureName(use),
      () => {
        const { width, height, pixels } = sizeSetPixels(main, words, use.sizes);
        return { width, height, pixels };
      },
      use.palette,
      use.raised,
    );
  const texels = texelsAPixel(PIXEL_UNITS * unit);
  const boards = [...sources]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, { source, palettes, ground, raised }]) => {
      // A mirrored picture is the unmirrored one's lines mirrored.
      const mirrored = name.endsWith('-mirrored');
      const grid = chosenLines(source.pixels, source.width, texels.across, texels.down);
      const chosen = turned(grid.indices, grid.width, mirrored);
      const indices = Array.from(chosen, (v) => (v === SHADOW ? 0 : v));
      const shadow = Array.from(chosen, (v) => (v === SHADOW ? 1 : 0));
      const scale = { x: grid.width / source.width, y: grid.height / source.height };
      const anchorX = (source.width / 2) * scale.x - 0.5;
      const sorted = [...palettes].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555.slice(1, 15), 0];
      const board = (named: string, anchorY: number | undefined) =>
        boardMaster(named, grid, indices, { x: anchorX, y: anchorY }, sorted, colors, {
          // The shadow on the picture's grid, anchored as the picture is.
          ...(shadow.some((v) => v)
            ? {
                shadow: {
                  width: grid.width,
                  height: grid.height,
                  anchorX,
                  anchorY: anchorY ?? grid.height - 0.5,
                  levels: [{ indices: shadow }],
                },
              }
            : {}),
        });
      const entry = (master: SpriteLodDocument) => ({
        name: master.name,
        colored: coloredColumns(source.pixels, source.width) * PIXEL_UNITS * unit,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
        split: false,
      });
      // On the ground a picture stands at its foot; raised off it, on its bottom edge (`-raised` where both are).
      const foot = ground ? footAnchorY(indices, grid.width, null) : undefined;
      if (foot === undefined) return [entry(board(name, undefined))];
      if (!raised) return [entry(board(name, foot))];
      return [{ ...entry(board(name, foot)), split: true }, entry(board(`${name}-raised`, undefined))];
    });
  return boards;
}
