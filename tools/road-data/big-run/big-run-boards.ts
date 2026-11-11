/**
 * BIG RUN's objects' pictures as course images ([BIG RUN road data](../../../docs/big-run-road-data.md#its-objects)):
 * each descriptor's sprite in a palette entry, mirrored where its object asks, at its descriptor's scales, pen 15 and
 * pen 0 (its shadow, or a color no board keeps) transparent, none where it draws nothing else; by chosen lines and the
 * sprites' rules, its base point its bottom row's left edge, where its object's lateral and height put it.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { namedBoardMaster, texelsAPixel } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { SPRITE_CLEAR, SPRITE_SHADOW, SPRITE_TILE, spritePen } from '../jaleco/zoom-sprites.js';
import { bigRunDescriptor } from './big-run-objects.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/** A board's image name: `bigrun-<its descriptor, four hex digits>`, then mirrored. */
export const boardName = (descriptor: number, mirrored: boolean) =>
  `bigrun-${descriptor.toString(16).padStart(4, '0')}${mirrored ? '-mirrored' : ''}`;

/** A board to draw: its descriptor, whether its objects mirror it, and its palettes, each its name and 16 colors. */
export interface BoardUse {
  readonly descriptor: number;
  readonly mirrored: boolean;
  readonly palettes: readonly { readonly name: string; readonly colors: readonly number[] }[];
}

/**
 * The boards of `uses` from the main program and the sprites' tiles `rom`, a sprite's pixel at its descriptor's scale
 * 128 `unitMetres` metres across, and down its height's scale's share of that times `aspect` (a screen pixel's height
 * over its width): each its name, colored columns from its left edge (metres), its width and its image, its palettes
 * the use's, pens 0 and 15 transparent.
 */
export function bigRunBoards(
  main: Uint8Array,
  rom: Uint8Array,
  uses: readonly BoardUse[],
  unitMetres: number,
  aspect: number,
) {
  const seen = new Set<string>();
  return uses.flatMap((use) => {
    const name = boardName(use.descriptor, use.mirrored);
    if (seen.has(name)) return [];
    seen.add(name);
    const d = bigRunDescriptor(main, use.descriptor);
    const [width, height] = [d.across * SPRITE_TILE, d.down * SPRITE_TILE];
    const pixels = new Uint8Array(width * height);
    for (let ty = 0; ty < d.down; ty++)
      for (let tx = 0; tx < d.across; tx++)
        for (let y = 0; y < SPRITE_TILE; y++)
          for (let x = 0; x < SPRITE_TILE; x++) {
            const pen = spritePen(rom, d.tile + ty * d.across + tx, x, y);
            const X = tx * SPRITE_TILE + x;
            // Pen 15 and pen 0 lie clear, every other pen its own index.
            pixels[(ty * SPRITE_TILE + y) * width + (use.mirrored ? width - 1 - X : X)] =
              pen === SPRITE_CLEAR || pen === SPRITE_SHADOW ? 0 : pen;
          }
    const pixel = (unitMetres * d.xScale) / 128;
    const texels = texelsAPixel(pixel, (aspect * d.yScale) / d.xScale);
    const source = { width, height, pixels };
    const parts = pictureParts(source, undefined, { base: height - 1, reason: "the object's point on the ground" });
    const grid = partsOnGrid(source, parts, texels.across, texels.down);
    if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${name} is larger than imageMasterTexels`);
    const master = namedBoardMaster(
      name,
      grid,
      grid.indices,
      { x: -0.5, y: grid.anchorY },
      use.palettes.map((p) => ({ name: p.name, colors: [0, ...p.colors.slice(1, 15), 0] })),
    );
    let [from, to] = [Infinity, -Infinity];
    pixels.forEach((v, at) => {
      if (v) [from, to] = [Math.min(from, at % width), Math.max(to, (at % width) + 1)];
    });
    // A sprite of its shadow alone (pen 0) draws no board.
    if (from === Infinity) return [];
    const across = grid.width / width / SPRITE_SOURCE_TEXELS_PER_METER;
    return [
      {
        name,
        colored: [from * across, to * across] as const,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
      },
    ];
  });
}
