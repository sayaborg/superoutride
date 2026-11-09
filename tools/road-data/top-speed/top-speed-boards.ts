/**
 * TOP SPEED's things' pictures as course images ([TOP SPEED road data](../../../docs/top-speed-road-data.md#its-things)):
 * each descriptor's pieces but those across the view at their full size (`top-speed-things`), the head over its
 * parts as the sprite list is drawn from its first entry, each in its palette's colors as the program sets them at its
 * start, pen 0 transparent; one picture, its colors as [Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces)' (`joinedColors`), by chosen lines and the
 * sprites' rules, with no shadow, its base point the thing's point on the ground.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { bandBoards } from '../shared/band-boards.js';
import { croppedPieces, joinedColors, layPieces } from '../shared/joined-pictures.js';
import { namedBoardMaster, paletteName, texelsAPixel } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { BIG_SPRITE, topSpeedBigSprite, topSpeedSpriteMap } from './top-speed-sprites.js';
import { SCREEN_WIDE, thingPalettes, topSpeedThing, type TopSpeedPiece } from './top-speed-things.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;
/** Its screen's pixels are square (320 × 240 on a 4:3 screen), and a sprite's zoom one on both axes. */
const PIXEL_ASPECT = 1;

/** A descriptor's image name: `topspeed-<its index, three decimal digits>`. */
export const thingName = (index: number) => `topspeed-${String(index).padStart(3, '0')}`;

/**
 * The descriptors' pictures as boards, a pixel `pixel` metres across and down, from the main and the sub programs and
 * the sprites' tiles `gfx`: one a descriptor, standing on the ground at the thing's point, its pieces' sprites from the
 * sprite map as its load record leaves it (`topSpeedSpriteMap`). With its colored columns from its point (metres on its
 * image, right positive), its width, how many colors it drew and the share of its pixels whose color another took.
 */
export function topSpeedBoards(
  main: Uint8Array,
  sub: Uint8Array,
  gfx: Uint8Array,
  indices: readonly number[],
  pixel: number,
) {
  const palettes = thingPalettes(main);
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  return [...new Set(indices)]
    .sort((a, b) => a - b)
    .map((index) => {
      const name = thingName(index);
      const thing = topSpeedThing(sub, index);
      const pieces = thing.pieces.filter((p) => p.type !== SCREEN_WIDE);
      if (!pieces.length) throw contractUnmet(`${name} has no piece but across the view`);
      const map = topSpeedSpriteMap(main, sub, thing.load ? [thing.load] : []);
      const pensOf = (p: TopSpeedPiece) => {
        const pens = topSpeedBigSprite(gfx, map, p.sprite);
        return Uint8Array.from({ length: pens.length }, (_, at) => {
          const [x, y] = [at % BIG_SPRITE, Math.floor(at / BIG_SPRITE)];
          return pens[(p.flipY ? BIG_SPRITE - 1 - y : y) * BIG_SPRITE + (p.flipX ? BIG_SPRITE - 1 - x : x)]!;
        });
      };
      const laid = croppedPieces(
        layPieces(
          pieces.map((p, k) => ({
            unit: name,
            s: 0,
            pixels: { width: BIG_SPRITE, height: BIG_SPRITE, pixels: pensOf(p) },
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
        pieces.map((p) => [{ name: paletteName(p.palette), colors: palettes(p.palette) }]),
      );
      const source = joined.picture;
      const ground = Math.round(laid.top / (pixel * PIXEL_ASPECT)) - 1;
      const parts = pictureParts(source, undefined, { base: ground, reason: "the thing's point on the ground" });
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${name} is larger than imageMasterTexels`);
      const point = -laid.left / pixel;
      const anchor = { x: (point * grid.width) / source.width - 0.5, y: grid.anchorY };
      const master = namedBoardMaster(name, grid, grid.indices, anchor, joined.palettes);
      let [from, to] = [Infinity, -Infinity];
      source.pixels.forEach((v, at) => {
        if (v) [from, to] = [Math.min(from, at % source.width), Math.max(to, (at % source.width) + 1)];
      });
      const across = grid.width / source.width / SPRITE_SOURCE_TEXELS_PER_METER;
      return {
        index,
        name,
        palette: joined.palettes[0]!.name,
        colored: [(from - point) * across, (to - point) * across] as const,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct: joined.distinct,
        replaced: joined.replaced,
        image: courseImageFile(master),
      };
    });
}

/**
 * The descriptors' pieces across the view (their type 5, at screen columns) as bands across the road
 * ([Strips](../../../docs/original-road-data.md#strips)), a pixel `pixel` metres across and down: each descriptor's such
 * pieces drawn once at their full size, laid by their screen columns, its middle the thing's lateral, and beyond its
 * edges its band, the columns of its last piece, a board extending right and its mirror left, all cut from one grid
 * (`bandBoards`), floating at its lowest colored row's height (`groundOffset`, metres), the bands `rise` metres higher
 * where their last row lies above it; the names the picture's and `-band`, `-band-mirrored`.
 */
export function topSpeedBands(
  main: Uint8Array,
  sub: Uint8Array,
  gfx: Uint8Array,
  indices: readonly number[],
  pixel: number,
) {
  const palettes = thingPalettes(main);
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  return [...new Set(indices)]
    .sort((a, b) => a - b)
    .map((index) => {
      const name = `${thingName(index)}-across`;
      const thing = topSpeedThing(sub, index);
      const pieces = thing.pieces.filter((p) => p.type === SCREEN_WIDE);
      if (!pieces.length) throw contractUnmet(`${name} has no piece across the view`);
      const map = topSpeedSpriteMap(main, sub, thing.load ? [thing.load] : []);
      const pensOf = (p: TopSpeedPiece) => {
        const pens = topSpeedBigSprite(gfx, map, p.sprite);
        return Uint8Array.from({ length: pens.length }, (_, at) => {
          const [x, y] = [at % BIG_SPRITE, Math.floor(at / BIG_SPRITE)];
          return pens[(p.flipY ? BIG_SPRITE - 1 - y : y) * BIG_SPRITE + (p.flipX ? BIG_SPRITE - 1 - x : x)]!;
        });
      };
      // The pieces laid by their columns, and beyond the right edge its last piece's columns, their mirror left.
      const x0 = Math.min(...pieces.map((p) => p.x));
      const last = pieces.reduce((a, p) => (p.x > a.x ? p : a));
      const shifted = pieces.map((p) => ({ ...p, x: p.x - x0 + BIG_SPRITE }));
      const width = Math.max(...shifted.map((p) => p.x)) + 2 * BIG_SPRITE;
      const lastPiece = { ...last, x: width - BIG_SPRITE };
      const mirrored = { ...last, x: 0, flipX: !last.flipX };
      const all = [...shifted, lastPiece, mirrored];
      const laid = layPieces(
        all.map((p, k) => ({
          unit: name,
          s: 0,
          pixels: { width: BIG_SPRITE, height: BIG_SPRITE, pixels: pensOf(p) },
          pixel,
          aspect: PIXEL_ASPECT,
          left: p.x * pixel,
          bottom: -(p.y + BIG_SPRITE) * pixel * PIXEL_ASPECT,
          floats: true,
          joins: true,
          order: all.length - 1 - k,
        })),
      );
      const joined = joinedColors(
        laid,
        all.map((p) => [{ name: paletteName(p.palette), colors: palettes(p.palette) }]),
      );
      const h = laid.height;
      const ground = Math.round(laid.top / (pixel * PIXEL_ASPECT)) - 1;
      const edges = [BIG_SPRITE, width - BIG_SPRITE] as const;
      const { picture, bands, rise } = bandBoards(
        { picture: name, band: `${name}-band`, mirrored: `${name}-band-mirrored` },
        joined.picture,
        pictureParts(joined.picture, undefined),
        edges,
        (edges[0] + edges[1]) / 2,
        texels,
        joined.palettes,
      );
      return {
        index,
        names: [picture.name, ...bands.map((b) => b.name)],
        palette: joined.palettes[0]!.name,
        groundOffset: (ground - h + 1) * pixel * PIXEL_ASPECT,
        rise,
        images: [picture, ...bands].map((master) => courseImageFile(master)),
      };
    });
}
