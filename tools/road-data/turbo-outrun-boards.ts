/**
 * TURBO OUTRUN's objects as boards ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its largest size's pixels in every palette it
 * is shown in, on the texel grid of its pixels at the road's scale, its base point the object's. The pictures are the
 * ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { cutBoard } from './extending-boards.js';
import { boardMaster, chosenLines, footAnchorY, SHADOW_PEN, texelsAPixel, turned, UNIT_METRES } from './pixel-grid.js';
import { anchorPoint, spritePixels } from './sprite-pixels.js';
import { readSizeList, readSpritePalette } from './turbo-outrun-road.js';

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
  /** Whether its kind's pixel 10 shades (its flags' bit 2): it is drawn with shadows allowed. */
  readonly shades: boolean;
  /** A strip's family: its nearest size, extending sideways away from the road. */
  readonly strip?: StripFamily;
}

/**
 * A picture's image name: `toutrun-<size list, five hex digits>`, then its scale where a pixel is not 2 road units
 * (`-u<thousandths of a unit>`) and whether mirrored; a strip's `toutrun-strip-<size list>`, whether mirrored, its
 * edge's `-edge` after the size list. Shadowed or not, a use shows one picture: none carries the shadow its original draws
 * apart.
 */
export function pictureName(use: Pick<PictureUse, 'sizes' | 'units' | 'mirrored' | 'strip'>) {
  const list = use.sizes.toString(16).padStart(5, '0');
  const mirrored = use.mirrored ? '-mirrored' : '';
  if (use.strip) return `toutrun-strip-${list}${mirrored}`;
  const scale = use.units === 2 ? '' : `-u${Math.round(use.units * 1000)}`;
  return `toutrun-${list}${scale}${mirrored}`;
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
 * palette's color), with its width in metres. Its base
 * point is its anchor's, `aside` across; no board carries the shadow picture its original draws apart (Original road
 * data's Shadows drawn apart). A strip extends sideways, cut (`cutBoard`) into its edge, a board of its own (`edge`),
 * and the part that repeats.
 */
export function turboOutrunBoards(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly (PictureUse & { readonly raised: boolean })[],
) {
  const groups = new Map<string, (PictureUse & { readonly raised: boolean })[]>();
  for (const use of uses) {
    const name = pictureName(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, group]) => {
      const [first] = group as [PictureUse & { readonly raised: boolean }];
      if (group.some((u) => u.anchor !== first.anchor || u.aside !== first.aside || u.units !== first.units))
        throw new RangeError(`Board ${name} is shown with different base points or scales`);
      const size = picturePixels(main, words, first);
      const texels = texelsAPixel(first.units * UNIT_METRES);
      const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
      const indices = turned(grid.indices, grid.width, first.mirrored);
      const scale = { x: grid.width / size.width, y: grid.height / size.height };
      const point = anchorPoint(first.anchor, grid.width, grid.height);
      const aside = (first.aside / first.units) * scale.x;
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555, 0];
      // A picture standing on the ground stands at its foot where a kind showing it there draws it with shadows allowed.
      const standing = point.y === grid.height - 0.5;
      const foot =
        standing && group.some((u) => u.shades && !u.raised) ? footAnchorY(indices, grid.width, SHADOW_PEN) : undefined;
      const anchorY = foot ?? point.y;
      const board = boardMaster(name, grid, indices, { x: point.x + aside, y: anchorY }, palettes, colors, {
        ...(first.strip ? { extend: first.mirrored ? ('left' as const) : ('right' as const) } : {}),
      });
      const entry = (master: SpriteLodDocument, edge?: string, split = false) => ({
        name: master.name,
        width: master.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
        split,
        ...(edge ? { edge } : {}),
      });
      // Shown raised off the ground too, a picture at its foot is shown so by its `-raised` image on its bottom edge.
      const split = foot !== undefined && group.some((u) => u.raised);
      if (split && first.strip) throw new RangeError(`Strip ${name} stands at its foot and raised`);
      if (!first.strip) {
        const { anchorY: _, ...bottom } = board;
        return [entry(board, undefined, split), ...(split ? [entry({ ...bottom, name: `${name}-raised` })] : [])];
      }
      const { edge, repeat } = cutBoard(board, name.replace(/^(toutrun-strip-[0-9a-f]+)/, '$1-edge'));
      return [entry(edge), entry(repeat, edge.name)];
    });
}
