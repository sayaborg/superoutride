/**
 * TURBO OUTRUN's objects as boards ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its largest size's pixels in every palette it
 * is shown in, on the texel grid of its pixels at the road's scale, by the sprites' rules, its shadow its own and the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { cutBoard } from './extending-boards.js';
import {
  boardMaster,
  chosenLines,
  coloredColumns,
  shadowFrame,
  texelsAPixel,
  turned,
  UNIT_METRES,
} from './pixel-grid.js';
import { partsOnGrid, pictureParts, shadingNames, spriteTable, unionFrames } from './sprite-rules.js';
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
  /** Whether its kind's pixel 10 shades (its flags' bit 2): it is drawn with shadows allowed. */
  readonly shades: boolean;
  /** A strip's family: its nearest size, extending sideways away from the road. */
  readonly strip?: StripFamily;
  /** Whether it lies on the road: its routine puts it there and the car does not hit it as a standing thing. */
  readonly lies?: boolean;
}

/**
 * A picture's image name: `toutrun-<size list, five hex digits>`, then its scale where a pixel is not 2 road units
 * (`-u<thousandths of a unit>`), whether mirrored and whether shadowed; a strip's `toutrun-strip-<size list>`, whether
 * mirrored, its edge's `-edge` after the size list.
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
 * Each use's image name (`pictureName`), a picture drawn both with shadows allowed and not shown by two images, the
 * latter's `-unshaded` after it (`shadingNames`): its pen 10 a color where the other's is shadow.
 */
export function pictureNames(uses: readonly PictureUse[]) {
  const shaded = (use: PictureUse) => use.shades || use.strip !== undefined;
  const names = shadingNames(uses, pictureName, shaded);
  return (use: PictureUse) => names(pictureName(use), shaded(use));
}

/**
 * The boards `uses` need: one a name (`pictureNames`), carrying every palette it is shown in (the lowest its default),
 * its largest size's pixels (a strip's nearest) by chosen lines (a mirrored picture the unmirrored one's mirrored) onto
 * the texel grid of its pixels at 40 texels/m, in the palettes' own colors, with its width in metres. What stands does
 * by the sprites' rules (`pictureParts`), drawn with shadows allowed where its kind shades, on its base, across at its
 * anchor's, `aside` across; a shadowed board's frame joins the shadow picture (the size list at 0x2667A) at its scale
 * and base point. What its routine puts on the road lies about its anchor (its top edge). A strip extends sideways,
 * standing on its bottom edge or folding at its anchor, cut (`cutBoard`) into its edge, a board of its own (`edge`),
 * and the part that repeats.
 */
export function turboOutrunBoards(main: Uint8Array, words: Uint32Array, uses: readonly PictureUse[]) {
  const nameOf = pictureNames(uses);
  const groups = new Map<string, PictureUse[]>();
  for (const use of uses) {
    const name = nameOf(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  const [shadow] = readShadowSizes(main).sizes;
  const shadowPixels = outline(spritePixels(words, shadow!), shadow!.width);
  const table = spriteTable();
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, group]) => {
      const [first] = group as [PictureUse];
      // A standing picture's anchor down is its height's, not its picture's: its uses agree across.
      const across = (u: PictureUse) => (u.strip || u.lies ? u.anchor : u.anchor & 3);
      if (group.some((u) => across(u) !== across(first) || u.aside !== first.aside || u.units !== first.units))
        throw new RangeError(`Board ${name} is shown with different base points or scales`);
      if (group.some((u) => !u.lies !== !first.lies)) throw new RangeError(`Board ${name} both lies and stands`);
      const size = picturePixels(main, words, first);
      const texels = texelsAPixel(first.units * UNIT_METRES);
      const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555, 0];
      // A body is at most as wide as the picture's colored columns (`coloredColumns`), metres.
      const colored = coloredColumns(size.pixels, size.width) * first.units * UNIT_METRES;
      const entry = (master: SpriteLodDocument, edge?: string) => ({
        name: master.name,
        width: master.width / SPRITE_SOURCE_TEXELS_PER_METER,
        colored,
        image: courseImageFile(master),
        ...(edge ? { edge } : {}),
      });
      if (first.strip || first.lies) {
        const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
        const point = anchorPoint(first.anchor, grid.width, grid.height);
        const aside = (first.aside / first.units) * (grid.width / size.width);
        const indices = turned(grid.indices, grid.width, first.mirrored);
        const board = boardMaster(name, grid, indices, { x: point.x + aside, y: point.y }, palettes, colors, {
          ...(first.lies
            ? { lies: true as const }
            : { extend: first.mirrored ? ('left' as const) : ('right' as const) }),
        });
        if (first.lies) return [entry(board)];
        const { edge, repeat } = cutBoard(board, name.replace(/^(toutrun-strip-[0-9a-f]+)/, '$1-edge'));
        return [entry(edge), entry(repeat, edge.name)];
      }
      const id = name.replace(/(-mirrored)?(-shadowed)?(-unshaded)?$/, '');
      const grid = partsOnGrid(size, pictureParts(size, first.shades, table.get(id)), texels.across, texels.down);
      const scale = { x: grid.width / size.width, y: grid.gridHeight / size.height };
      const aside = (first.aside / first.units) * scale.x;
      const point = { x: anchorPoint(first.anchor, grid.width, 0).x + aside, y: grid.anchorY };
      const frame = unionFrames(
        grid.shadow && {
          width: grid.width,
          height: grid.gridHeight,
          anchorX: point.x,
          anchorY: point.y,
          levels: [{ indices: turned(grid.shadow, grid.width, first.mirrored) }],
        },
        first.shadow ? shadowFrame(shadowPixels, shadow!.width, scale, first.anchor, -aside / scale.x) : undefined,
      );
      const indices = turned(grid.indices, grid.width, first.mirrored);
      return [entry(boardMaster(name, grid, indices, point, palettes, colors, frame ? { shadow: frame } : {}))];
    });
}
