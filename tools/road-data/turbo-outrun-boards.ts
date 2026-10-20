/**
 * TURBO OUTRUN's objects as boards ([Original road data](../../docs/original-road-data.md#turbo-outruns-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its largest size's pixels in every palette it
 * is shown in, on the texel grid of its pixels at the road's scale, its base point the object's, its shadow the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { mirror, shadowFrame } from './outrun-boards.js';
import { chosenLines, paletteName, texelsAPixel } from './pixel-grid.js';
import { anchorPoint, outline, spritePixels } from './sprite-pixels.js';
import { readShadowSizes, readSizeList, readSpritePalette } from './turbo-outrun-road.js';

/** A board's base point down: the bottom of its picture (anchor 8), or its middle (anchor 0, a patch on the road). */
export type Foot = 8 | 0;

/**
 * One way an object shows a picture: its size list, the road units a pixel of its largest size spans, mirrored or not,
 * in a palette, shadowed or not, its base point down, and across its anchor (the picture's middle) the road units its
 * base point stands aside, as shown: where its body stands.
 */
export interface PictureUse {
  readonly sizes: number;
  readonly units: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly shadow: boolean;
  readonly foot: Foot;
  readonly aside: number;
}

/**
 * A picture's image name: `toutrun-<size list, five hex digits>`, then its scale where a pixel is not 2 road units
 * (`-u<thousandths of a unit>`), whether mirrored and whether shadowed.
 */
export function pictureName(use: Pick<PictureUse, 'sizes' | 'units' | 'mirrored' | 'shadow'>) {
  const scale = use.units === 2 ? '' : `-u${Math.round(use.units * 1000)}`;
  return `toutrun-${use.sizes.toString(16).padStart(5, '0')}${scale}${use.mirrored ? '-mirrored' : ''}${use.shadow ? '-shadowed' : ''}`;
}

/**
 * The boards `uses` need: one a name, carrying every palette it is shown in (the lowest its default), its largest
 * size's pixels by chosen lines (`chosenLines`, a mirrored picture the unmirrored one's mirrored) onto the texel grid
 * of its pixels at 40 texels/m, in the palettes' own colors (pixel 10 of a shading kind kept as its palette's color),
 * with its width in metres. Its base point is its foot's, `aside` across; a shadowed board carries the shadow picture
 * (the size list at 0x2667A) at its scale and base point.
 */
export function turboOutrunBoards(main: Uint8Array, words: Uint32Array, uses: readonly PictureUse[]) {
  const groups = new Map<string, PictureUse[]>();
  for (const use of uses) {
    const name = pictureName(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  const [shadow] = readShadowSizes(main).sizes;
  const shadowPixels = outline(spritePixels(words, shadow!), shadow!.width);
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, group]) => {
      const [first] = group as [PictureUse];
      if (group.some((u) => u.foot !== first.foot || u.aside !== first.aside))
        throw new RangeError(`Board ${name} is shown with different base points`);
      const [size] = readSizeList(main, first.sizes, 1);
      const texels = texelsAPixel(first.units);
      const grid = chosenLines(spritePixels(words, size!), size!.width, texels.across, texels.down);
      const indices = first.mirrored ? mirror(grid.indices, grid.width) : grid.indices;
      const scale = { x: grid.width / size!.width, y: grid.height / size!.height };
      const point = anchorPoint(first.foot, grid.width, grid.height);
      const aside = (first.aside / first.units) * scale.x;
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555, 0];
      const board: SpriteLodDocument = {
        format: 'superoutride.sprite-lod',
        version: 4,
        name,
        width: grid.width,
        height: grid.height,
        anchorX: point.x + aside,
        anchorY: point.y,
        defaultPalette: paletteName(palettes[0]!),
        palettes: Object.fromEntries(palettes.map((p) => [paletteName(p), { colors: colors(p) }])),
        levels: [
          {
            paletteRgb555: colors(palettes[0]!),
            indices,
            mixtures: spriteIdentityMixtures(),
          },
        ],
        ...(first.shadow
          ? { shadow: shadowFrame(shadowPixels, shadow!.width, scale, first.foot, -aside / scale.x) }
          : {}),
      };
      return { name, width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER, image: courseImageFile(board) };
    });
}
