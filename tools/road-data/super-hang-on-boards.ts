/**
 * SUPER HANG-ON's pictures as course images ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): each
 * sprite or frame an object shows, mirrored as shown, from its largest size's pixels by chosen lines onto its texel grid at
 * the scale the original draws it where it passes the bike, in every palette it is shown in, by the sprites' rules, its
 * base point the middle of its base. They are the original's pictures, provisional: the product's are drawn again.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { boardMaster, chosenLines, texelsAPixel, turned } from './pixel-grid.js';
import { partsOnGrid, pictureParts, spriteTable } from './sprite-rules.js';
import { sizeList, spriteList, spritePalette, spritePixels, SPRITE_COUNT } from './super-hang-on-sprites.js';

/**
 * Road units a pixel of an object's largest size spans where it passes the bike: the original draws that size 1:1 on
 * line 191 of the road, where a unit is 191 / 224 pixels.
 */
export const PIXEL_UNITS = 224 / 191;

/**
 * One way an object shows a picture: its size list, mirrored or not, in a palette, and whether it stands, drawn with
 * shadows allowed, or floats a pixel or more (`floats`), its pen 10 a color.
 */
export interface PictureUse {
  readonly list: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly shades: boolean;
}

/**
 * A picture's image name: `shangon-<sprite>` for a size list the sprites' table names (the lowest such sprite, three
 * digits), else `shangon-frame-<address>`; then whether mirrored.
 */
export function pictureName(main: Uint8Array, use: Pick<PictureUse, 'list' | 'mirrored'>): string {
  let sprite = -1;
  for (let s = 0; s < SPRITE_COUNT && sprite < 0; s++) if (spriteList(main, s) === use.list) sprite = s;
  const shown = sprite >= 0 ? String(sprite).padStart(3, '0') : `frame-${use.list.toString(16)}`;
  return `shangon-${shown}${use.mirrored ? '-mirrored' : ''}`;
}

/** Size list `list`'s largest size by chosen lines at `metres` a road unit, 40 texels a metre. */
export function chosenPicture(main: Uint8Array, words: Uint16Array, list: number, metres: number) {
  const { width, pixels } = spritePixels(words, sizeList(main, list)[0]!);
  const texels = texelsAPixel(PIXEL_UNITS * metres);
  return chosenLines(pixels, width, texels.across, texels.down);
}

/**
 * The pictures `uses` need, at `metres` a road unit: one a size list and mirroring, carrying every palette it is shown
 * in (the lowest its default), from its largest size's pixels by chosen lines, with its width in metres. Every sprite is
 * drawn with shadows allowed where it stands: each stands on its base by the sprites' rules (`pictureParts`), its
 * shadow its frame. No picture both stands and floats.
 */
export function superHangOnPictures(main: Uint8Array, words: Uint16Array, uses: readonly PictureUse[], metres: number) {
  const groups = new Map<string, PictureUse[]>();
  for (const use of uses) {
    const name = pictureName(main, use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  const texels = texelsAPixel(PIXEL_UNITS * metres);
  const table = spriteTable();
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, group]) => {
      const [first] = group as [PictureUse];
      if (group.some((u) => u.shades !== first.shades)) throw new RangeError(`Picture ${name} both stands and floats`);
      const source = spritePixels(words, sizeList(main, first.list)[0]!);
      const picture = { ...source, height: source.pixels.length / source.width };
      const grid = partsOnGrid(
        picture,
        pictureParts(picture, first.shades, table.get(name.replace(/-mirrored$/, ''))),
        texels.across,
        texels.down,
      );
      // A mirrored picture is the unmirrored one's lines mirrored.
      const anchor = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...spritePalette(main, p).slice(1)];
      const shadow = grid.shadow && {
        width: grid.width,
        height: grid.gridHeight,
        anchorX: anchor.x,
        anchorY: anchor.y,
        levels: [{ indices: turned(grid.shadow, grid.width, first.mirrored) }],
      };
      const master = boardMaster(
        name,
        grid,
        turned(grid.indices, grid.width, first.mirrored),
        anchor,
        palettes,
        colors,
        shadow ? { shadow } : {},
      );
      return { name, width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER, image: courseImageFile(master) };
    });
}
