/**
 * SUPER HANG-ON's pictures as course images ([Original road data](../../docs/original-road-data.md#super-hang-on)): each
 * sprite or frame an object shows, mirrored as shown, from its largest size's pixels by chosen lines onto its texel grid at
 * the scale the original draws it where it passes the bike, in every palette it is shown in, its base point the middle
 * of its bottom. They are the original's pictures, provisional: the product's are drawn again.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { chosenLines, footAnchorY, paletteName, PIXEL_ASPECT, SHADOW_PEN } from './pixel-grid.js';
import { sizeList, spriteList, spritePalette, spritePixels, SPRITE_COUNT } from './super-hang-on-sprites.js';

/**
 * Road units a pixel of an object's largest size spans where it passes the bike: the original draws that size 1:1 on
 * line 191 of the road, where a unit is 191 / 224 pixels.
 */
export const PIXEL_UNITS = 224 / 191;

/** One way an object shows a picture: its size list, mirrored or not, in a palette, raised off the ground or not. */
export interface PictureUse {
  readonly list: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly raised: boolean;
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
  const across = PIXEL_UNITS * metres * SPRITE_SOURCE_TEXELS_PER_METER;
  return chosenLines(pixels, width, across, across * PIXEL_ASPECT);
}

/**
 * The pictures `uses` need, at `metres` a road unit: one a size list and mirroring, carrying every palette it is shown
 * in (the lowest its default), from its largest size's pixels by chosen lines, with its width in metres. Every sprite is
 * drawn with shadows allowed: a picture shown on the ground stands at its foot (`footAnchorY`), its shadow's rows below
 * it lying on the nearer ground, and is shown raised off it by its `-raised` image (`split`) on its bottom edge.
 */
export function superHangOnPictures(main: Uint8Array, words: Uint16Array, uses: readonly PictureUse[], metres: number) {
  const groups = new Map<string, PictureUse[]>();
  for (const use of uses) {
    const name = pictureName(main, use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, group]) => {
      const [first] = group as [PictureUse];
      const grid = chosenPicture(main, words, first.list, metres);
      // A mirrored picture is the unmirrored one's lines mirrored.
      const indices = first.mirrored
        ? grid.indices.map((_, i) => grid.indices[i - (i % grid.width) + grid.width - 1 - (i % grid.width)]!)
        : grid.indices;
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...spritePalette(main, p).slice(1)];
      const foot = group.some((u) => !u.raised) ? footAnchorY(indices, grid.width, SHADOW_PEN) : undefined;
      const master = (named: string, anchorY: number | undefined): SpriteLodDocument => ({
        format: 'superoutride.sprite-lod',
        version: 6,
        name: named,
        width: grid.width,
        height: grid.height,
        anchorX: grid.width / 2 - 0.5,
        ...(anchorY === undefined ? {} : { anchorY }),
        defaultPalette: paletteName(palettes[0]!),
        palettes: Object.fromEntries(palettes.map((p) => [paletteName(p), { colors: colors(p) }])),
        levels: [
          {
            paletteRgb555: colors(palettes[0]!),
            indices,
            mixtures: spriteIdentityMixtures(),
          },
        ],
      });
      const picture = (named: string, anchorY: number | undefined, split = false) => ({
        name: named,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master(named, anchorY)),
        split,
      });
      return foot !== undefined && group.some((u) => u.raised)
        ? [picture(name, foot, true), picture(`${name}-raised`, undefined)]
        : [picture(name, foot)];
    });
}
