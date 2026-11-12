/**
 * The JALECO board's objects' pictures as course images (BIG RUN's and CISCO HEAT's, [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-objects)):
 * each a sprite of the board's zoomed sprites in a palette entry, mirrored where its object asks, at its scales, pen 15
 * and pen 0 (its shadow, or a color no board keeps) transparent, none where it draws nothing else; by chosen lines and
 * the sprites' rules, its base point its bottom row's left edge, where its object's lateral and height put it.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { namedBoardMaster, texelsAPixel } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { SPRITE_CLEAR, SPRITE_SHADOW, SPRITE_TILE, spritePen } from './zoom-sprites.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

/**
 * A board to draw: its image's name; its sprite's tiles from `tile`, `across` × `down`; its scales across and down,
 * 1 its own size; whether its objects mirror it; and its palettes, each its name and 16 colors.
 */
export interface BoardUse {
  readonly name: string;
  readonly tile: number;
  readonly across: number;
  readonly down: number;
  readonly xScale: number;
  readonly yScale: number;
  readonly mirrored: boolean;
  readonly palettes: readonly { readonly name: string; readonly colors: readonly number[] }[];
}

/** A board's sprite: a use without its palettes. */
export type BoardSprite = Omit<BoardUse, 'palettes'>;

/**
 * Boards' uses gathered object by object: one a board's name, a palette each set of colors an object of a stage takes,
 * named `p<its entry, three digits>`, then `-<its stage>` where another stage gives that entry other colors.
 */
export function boardUses() {
  const uses = new Map<string, BoardUse & { palettes: { name: string; colors: readonly number[] }[] }>();
  const names = new Map<string, string>();
  return {
    /** An object of stage `stage` drawing `sprite` in its palette entry `color`, of colors `colors`. */
    add(sprite: BoardSprite, stage: number, color: number, colors: readonly number[]) {
      const use = uses.get(sprite.name) ?? { ...sprite, palettes: [] };
      uses.set(sprite.name, use);
      const key = `${sprite.name} ${stage} ${color}`;
      if (names.has(key)) return;
      const entry = `p${String(color).padStart(3, '0')}`;
      const same = use.palettes.find((p) => p.colors.join() === colors.join());
      const name = same?.name ?? `${entry}${use.palettes.some((p) => p.name.startsWith(entry)) ? `-${stage}` : ''}`;
      if (!same) use.palettes.push({ name, colors });
      names.set(key, name);
    },
    /** The palette's name of board `board` in stage `stage`'s entry `color`. */
    paletteOf: (board: string, stage: number, color: number) => names.get(`${board} ${stage} ${color}`)!,
    uses: (): readonly BoardUse[] => [...uses.values()],
  };
}

/**
 * The boards of `uses` from the sprites' tiles `rom`, a sprite's pixel at its own size `unitMetres` metres across, at its
 * use's scale across, and down its scale down's share of that times `aspect` (a screen pixel's height over its width):
 * each its name, colored columns from its left edge (metres), its width and its image, its palettes the use's, pens 0
 * and 15 transparent; one a name.
 */
export function zoomBoards(rom: Uint8Array, uses: readonly BoardUse[], unitMetres: number, aspect: number) {
  const seen = new Set<string>();
  return uses.flatMap((use) => {
    const { name } = use;
    if (seen.has(name)) return [];
    seen.add(name);
    const [width, height] = [use.across * SPRITE_TILE, use.down * SPRITE_TILE];
    const pixels = new Uint8Array(width * height);
    for (let ty = 0; ty < use.down; ty++)
      for (let tx = 0; tx < use.across; tx++)
        for (let y = 0; y < SPRITE_TILE; y++)
          for (let x = 0; x < SPRITE_TILE; x++) {
            const pen = spritePen(rom, use.tile + ty * use.across + tx, x, y);
            const X = tx * SPRITE_TILE + x;
            // Pen 15 and pen 0 lie clear, every other pen its own index.
            pixels[(ty * SPRITE_TILE + y) * width + (use.mirrored ? width - 1 - X : X)] =
              pen === SPRITE_CLEAR || pen === SPRITE_SHADOW ? 0 : pen;
          }
    const pixel = unitMetres * use.xScale;
    const texels = texelsAPixel(pixel, (aspect * use.yScale) / use.xScale);
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
