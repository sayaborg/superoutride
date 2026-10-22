/**
 * TURBO OUTRUN's objects as boards ([Original road data](../../docs/original-road-data.md#turbo-outruns-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its largest size's pixels in every palette it
 * is shown in, on the texel grid of its pixels at the road's scale, its base point the object's, its shadow the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { shadowFrame } from './outrun-boards.js';
import { chosenLines, mirror, paletteName, texelsAPixel } from './pixel-grid.js';
import { anchorPoint, outline, spritePixels } from './sprite-pixels.js';
import { readShadowSizes, readSizeList, readSpritePalette } from './turbo-outrun-road.js';

/** A strip's family: how many sizes its list holds and the nearest's place. */
export interface StripFamily {
  readonly sizes: number;
  readonly nearest: number;
}

/**
 * One way an object shows a picture: its size list, the road units a pixel of its largest size spans, mirrored or not,
 * in a palette, shadowed or not, its base point by `anchor` (`anchorPoint`: across its middle, left or right edge, down
 * its middle or bottom), and across from a middle anchor the road units its base point stands aside, as shown: where
 * its body stands. A strip's picture is its family's nearest size.
 */
export interface PictureUse {
  readonly sizes: number;
  readonly units: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly shadow: boolean;
  readonly anchor: number;
  readonly aside: number;
  readonly strip?: StripFamily;
  /** A strip rising from the ground: its family's nearest size, extending sideways away from the road. */
  readonly extends?: true;
}

/**
 * A picture's image name: `toutrun-<size list, five hex digits>`, then its scale where a pixel is not 2 road units
 * (`-u<thousandths of a unit>`), whether mirrored and whether shadowed; a strip's `toutrun-strip-<size list>`, whether
 * mirrored.
 */
export function pictureName(use: Pick<PictureUse, 'sizes' | 'units' | 'mirrored' | 'shadow' | 'strip'>) {
  const list = use.sizes.toString(16).padStart(5, '0');
  const mirrored = use.mirrored ? '-mirrored' : '';
  if (use.strip) return `toutrun-strip-${list}${mirrored}`;
  const scale = use.units === 2 ? '' : `-u${Math.round(use.units * 1000)}`;
  return `toutrun-${list}${scale}${mirrored}${use.shadow ? '-shadowed' : ''}`;
}

/** A picture's pixels: its largest size's, a strip's nearest size's (its edge nearest the road on the left). */
function picturePixels(main: Uint8Array, words: Uint32Array, use: Pick<PictureUse, 'sizes' | 'strip'>) {
  const size = use.strip
    ? readSizeList(main, use.sizes, use.strip.sizes)[use.strip.nearest]!
    : readSizeList(main, use.sizes, 1)[0]!;
  return { pixels: spritePixels(words, size), width: size.width, height: size.height };
}

/**
 * The boards `uses` need: one a name, carrying every palette it is shown in (the lowest its default), its largest
 * size's pixels (a strip's nearest) by chosen lines (`chosenLines`, a mirrored picture the unmirrored one's mirrored)
 * onto the texel grid of its pixels at 40 texels/m, in the palettes' own colors (pixel 10 of a shading kind kept as its
 * palette's color), with its width in metres, its master and its base point's height (for what is baked lying). Its base point is its anchor's, `aside` across; a shadowed board carries the shadow picture
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
      if (group.some((u) => u.anchor !== first.anchor || u.aside !== first.aside || u.units !== first.units))
        throw new RangeError(`Board ${name} is shown with different base points or scales`);
      const size = picturePixels(main, words, first);
      const texels = texelsAPixel(first.units);
      const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
      const indices = first.mirrored ? mirror(grid.indices, grid.width) : grid.indices;
      const scale = { x: grid.width / size.width, y: grid.height / size.height };
      const point = anchorPoint(first.anchor, grid.width, grid.height);
      const aside = (first.aside / first.units) * scale.x;
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555, 0];
      const board: SpriteLodDocument = {
        format: 'superoutride.sprite-lod',
        version: 6,
        name,
        width: grid.width,
        height: grid.height,
        anchorX: point.x + aside,
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
          ? { shadow: shadowFrame(shadowPixels, shadow!.width, scale, first.anchor, -aside / scale.x) }
          : {}),
        ...(first.extends ? { extend: first.mirrored ? ('left' as const) : ('right' as const) } : {}),
      };
      return {
        name,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        master: board,
        anchorY: point.y,
        image: courseImageFile(board),
      };
    });
}
