/**
 * CHASE H.Q.'s things' pictures as course images ([CHASE H.Q. road data](../../../docs/chase-hq-road-data.md#chase-hqs-objects)):
 * each kind's pieces at their full size (`chase-hq-things`), the first over those after it as the sprite list is drawn
 * from its last entry, each in its palette line's colors as the program fades them in (M 0x1484), pen 0 transparent;
 * one picture, its colors as [Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)'
 * (`joinedColors`), by chosen lines and the sprites' rules, with no shadow, its base point the thing's point on the
 * ground.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { instruction, word } from '../cpu/program-words.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { croppedPieces, joinedColors, layPieces } from '../shared/joined-pictures.js';
import { namedBoardMaster, paletteName, texelsAPixel } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { rgb555Of } from '../taito/palette.js';
import { BIG_SPRITE, zBigSprite } from '../taito/z-sprites.js';
import { PIXEL_ASPECT } from '../taito/z-system-display.js';
import { chaseHqThings } from './chase-hq-things.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;
/** A palette line's pens. */
const PENS = 16;

/** A kind's image name: `chasehq-<its kind, three hex digits>`. */
export const thingName = (kind: number) => `chasehq-${kind.toString(16).padStart(3, '0')}`;

/** The palette's colors as the main program fades them in (M 0x1484: entry e at its table's 2e), by line and pen. */
function startColors(main: Uint8Array) {
  const [high, low] = instruction(
    main,
    0x1484,
    [0x207c, null, null, 0x3200, 0xd241, 0xd0c1],
    "the palette's colors (movea.l, move.w, add.w, adda.w)",
  );
  const table = high * 0x10000 + low;
  return (line: number) =>
    Array.from({ length: PENS }, (_, pen) => rgb555Of(word(main, table + 2 * (line * PENS + pen))));
}

/**
 * The kinds' pictures as boards, a pixel `pixel` metres across and `PIXEL_ASPECT` times that down, by `sprites` (OBJ A
 * and the spritemap, `assembleChaseHqSprites`): one a kind, standing on the ground at the thing's point where a piece
 * reaches it, else floating at its lowest colored row's height (`groundOffset`, metres). With its colored columns from
 * its point (metres on its image, right positive), its width, how many colors it drew and the share of its pixels whose color
 * another took.
 */
export function chaseHqBoards(
  main: Uint8Array,
  sprites: { readonly gfx: Uint8Array; readonly map: Uint8Array },
  kinds: readonly number[],
  pixel: number,
) {
  const things = chaseHqThings(main);
  const colors = startColors(main);
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const drawn = new Map<number, Uint8Array>();
  const spritePens = (sprite: number) => {
    if (!drawn.has(sprite)) drawn.set(sprite, zBigSprite(sprites.gfx, sprites.map, sprite));
    return drawn.get(sprite)!;
  };
  const pensOf = (sprite: number, flipX: boolean, flipY: boolean) => {
    const pens = spritePens(sprite);
    return Uint8Array.from({ length: pens.length }, (_, at) => {
      const [x, y] = [at % BIG_SPRITE, Math.floor(at / BIG_SPRITE)];
      return pens[(flipY ? BIG_SPRITE - 1 - y : y) * BIG_SPRITE + (flipX ? BIG_SPRITE - 1 - x : x)]!;
    });
  };
  return [...new Set(kinds)]
    .sort((a, b) => a - b)
    .map((kind) => {
      const name = thingName(kind);
      const pieces = things(kind);
      const laid = croppedPieces(
        layPieces(
          pieces.map((p, k) => ({
            unit: name,
            s: 0,
            pixels: { width: BIG_SPRITE, height: BIG_SPRITE, pixels: pensOf(p.sprite, p.flipX, p.flipY) },
            pixel,
            aspect: PIXEL_ASPECT,
            left: p.x * pixel,
            bottom: -(p.y + BIG_SPRITE) * pixel * PIXEL_ASPECT,
            floats: false,
            joins: true,
            order: pieces.length - 1 - k,
          })),
        ),
      );
      const joined = joinedColors(
        laid,
        pieces.map((p) => [{ name: paletteName(p.line), colors: colors(p.line) }]),
      );
      const source = joined.picture;
      // The row whose bottom edge is the ground, rows from the picture's top.
      const ground = Math.round(laid.top / (pixel * PIXEL_ASPECT)) - 1;
      const stands = ground < source.height;
      const parts = pictureParts(
        source,
        undefined,
        stands ? { base: ground, reason: "the thing's point on the ground" } : undefined,
      );
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${name} is larger than imageMasterTexels`);
      const point = -laid.left / pixel;
      const anchor = { x: (point * grid.width) / source.width - 0.5, y: grid.anchorY };
      const master = namedBoardMaster(name, grid, grid.indices, anchor, joined.palettes);
      let [from, to] = [Infinity, -Infinity];
      source.pixels.forEach((v, at) => {
        if (v) [from, to] = [Math.min(from, at % source.width), Math.max(to, (at % source.width) + 1)];
      });
      // A source column's metres on the image's grid.
      const across = grid.width / source.width / SPRITE_SOURCE_TEXELS_PER_METER;
      return {
        kind,
        name,
        palette: joined.palettes[0]!.name,
        colored: [(from - point) * across, (to - point) * across] as const,
        groundOffset: stands ? 0 : (ground - source.height + 1) * pixel * PIXEL_ASPECT,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct: joined.distinct,
        replaced: joined.replaced,
        image: courseImageFile(master),
      };
    });
}
