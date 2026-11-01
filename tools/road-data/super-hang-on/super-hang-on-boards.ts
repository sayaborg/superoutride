/**
 * SUPER HANG-ON's pictures as course images ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)): each
 * sprite or frame an object shows, mirrored as shown, from its largest size's pixels by chosen lines onto its texel grid at
 * the scale the original draws it where it passes the bike, in every palette it is shown in, by the sprites' rules, its
 * base point the middle of its base. They are the original's pictures, provisional: the product's are drawn again.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { boardColors, boardMaster, texelsAPixel, turned } from '../shared/pixel-grid.js';
import {
  partsOnGrid,
  pictureParts,
  shadingNames,
  paintedShadow,
  spriteTable,
  tableKey,
} from '../shared/sprite-rules.js';
import { sizeList, spriteList, spritePalette, spritePixels, SPRITE_COUNT } from './super-hang-on-sprites.js';
import { PIXEL_ASPECT, SHADOW_PEN } from '../sega-16/display.js';

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

/**
 * Each use's image name (`pictureName`), a picture drawn both with shadows allowed and not shown by two images, the
 * latter's `-unshaded` after it (`shadingNames`): its pen 10 a color where the other's is shadow.
 */
export function pictureNames(main: Uint8Array, uses: readonly PictureUse[]) {
  const name = (use: PictureUse) => pictureName(main, use);
  const names = shadingNames(uses, name, (use) => use.shades);
  return (use: PictureUse) => names(name(use), use.shades);
}

/**
 * The pictures `uses` need, at `pixel` metres a pixel of their largest size (`drawScales`): one a size list and
 * mirroring, carrying every palette it is shown in (the lowest its default), from its largest size's pixels by chosen
 * lines, with its width in metres. Every sprite is drawn with shadows allowed where it stands: each stands on its base
 * by the sprites' rules (`pictureParts`), its shadow its frame; one a name (`pictureNames`).
 */
export function superHangOnPictures(main: Uint8Array, words: Uint16Array, uses: readonly PictureUse[], pixel: number) {
  const named = pictureNames(main, uses);
  const groups = new Map<string, PictureUse[]>();
  for (const use of uses) {
    const name = named(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  const texels = texelsAPixel(pixel, PIXEL_ASPECT);
  const table = spriteTable();
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, group]) => {
      const [first] = group as [PictureUse];
      const source = spritePixels(words, sizeList(main, first.list)[0]!);
      const picture = { ...source, height: source.pixels.length / source.width };
      const grid = partsOnGrid(
        picture,
        pictureParts(picture, first.shades ? SHADOW_PEN : undefined, table.get(tableKey(name))),
        texels.across,
        texels.down,
      );
      // A mirrored picture is the unmirrored one's lines mirrored.
      const anchor = { x: grid.width / 2 - 0.5, y: grid.anchorY };
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => boardColors(spritePalette(main, p).slice(1));
      const shadow = paintedShadow(grid, anchor, first.mirrored);
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
