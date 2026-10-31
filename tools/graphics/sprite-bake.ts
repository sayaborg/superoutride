import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { recolorSpriteColor, type PaletteFrame } from './sprite-alternate-palettes.js';
import { composePieceTransform, recipeOriginal, type PieceTransform, type SpriteRecipe } from './sprite-import.js';
import { masterTexel, spriteMasterWidth, type SourceImage } from './sprite-source-compiler.js';

/**
 * A piece to bake: its picture's level 0 (texels and base point) in its palette's colors, its lateral and ground offset
 * (m) from a common reference, and how far K moved it (texels).
 */
export interface BakePiece {
  readonly frame: PaletteFrame & { readonly anchorX: number; readonly anchorY: number };
  readonly colors: readonly number[];
  readonly across: number;
  readonly up: number;
  readonly moved: { readonly x: number; readonly y: number };
}

/** The pieces composed into one picture at master texels (40 a metre). */
export interface ComposedPieces {
  readonly image: SourceImage;
  /** Each texel's piece and its slot, `piece · 16 + slot`, or −1 where no piece is. */
  readonly provenance: Int32Array;
  /** Each piece's frame's top-left texel in the composition. */
  readonly origins: readonly { readonly x: number; readonly y: number }[];
  /**
   * The base point (texel-centre coordinates): by default, across, the middle of the pieces' outer edges and, down, the
   * lowest piece's ground row, moved by K's whole texels. `across` and `up` are its lateral and ground offset (m) from
   * the reference.
   */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly across: number;
  readonly up: number;
}

/**
 * The size-0 offset of a piece's frame: the product's sprite drawing at 40 pixels a metre puts a level whose left (or
 * top) edge falls at `edge` on the pixel `ceil(edge − 0.5)`, the pixel whose centre the edge's first texel holds.
 */
const placed = (edge: number) => Math.ceil(edge - 0.5);

/**
 * Pieces composed into one picture as the product draws them at size 0 on a frame where the reference falls on a whole
 * pixel:
 * each piece's frame at the texel the drawing puts it on (its base point at `across`, `up` and K's move, by
 * `placed`), in its colors, a later piece over an earlier one as the renderer draws pictures at one depth. The
 * composition is the pieces' extent; each texel says which piece and slot it shows.
 */
export function composePieces(
  pieces: readonly BakePiece[],
  anchorMoved: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): ComposedPieces {
  if (!pieces.length) throw new RangeError('A composition needs a piece');
  const ppm = SPRITE_SOURCE_TEXELS_PER_METER;
  const edges = pieces.map(({ frame, across, up, moved }) => ({
    x: placed(across * ppm + moved.x - (frame.anchorX + 0.5)),
    y: placed(-up * ppm + moved.y - (frame.anchorY + 0.5)),
  }));
  const left = Math.min(...edges.map((edge) => edge.x)),
    top = Math.min(...edges.map((edge) => edge.y));
  const right = Math.max(...edges.map((edge, i) => edge.x + pieces[i]!.frame.width)),
    bottom = Math.max(...edges.map((edge, i) => edge.y + pieces[i]!.frame.height));
  const width = right - left,
    height = bottom - top;
  const pixels = new Uint32Array(width * height);
  const provenance = new Int32Array(width * height).fill(-1);
  const origins = edges.map((edge) => ({ x: edge.x - left, y: edge.y - top }));
  pieces.forEach(({ frame, colors }, i) => {
    const origin = origins[i]!;
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        const slot = frame.indices[y * frame.width + x]!;
        if (!slot) continue;
        const at = (origin.y + y) * width + origin.x + x;
        pixels[at] = rgb555ToRgba(colors[slot]!);
        provenance[at] = i * 16 + slot;
      }
  });
  // The lowest piece stands nearest the ground; the base point sits on its ground row.
  const lowest = pieces.reduce((low, piece, i) => (piece.up < pieces[low]!.up ? i : low), 0);
  const anchorX = width / 2 - 0.5 + anchorMoved.x,
    anchorY = origins[lowest]!.y + pieces[lowest]!.frame.anchorY + anchorMoved.y;
  return {
    image: { width, height, pixels },
    provenance,
    origins,
    anchorX,
    anchorY,
    // The base point's place in metres from the reference, at which the composition's texels fall where the pieces' do.
    across: (left + anchorX + 0.5) / ppm,
    up: -(top + anchorY + 0.5) / ppm,
  };
}

/**
 * A baked piece's map of a composition pixel to its original's body, its frame's top-left texel at `origin`. An
 * original piece is its own original. A product piece's original is its recipe's one, reached through the recipe's map
 * of its source; a product picture's reflection (`mirrored`) reaches the reflection of that original, whose body is
 * `bodyWidth` texels wide, through the reflected map (a transform holds no reflection).
 */
export function bakedPieceTransform(
  origin: { readonly x: number; readonly y: number },
  product: { readonly recipe: SpriteRecipe; readonly mirrored: boolean; readonly bodyWidth: number } | null,
): PieceTransform {
  const shift = { scale: 1, x: -origin.x, y: -origin.y };
  if (!product) return shift;
  const { recipe, mirrored, bodyWidth } = product;
  const one = recipeOriginal(recipe);
  if (!one) throw new RangeError('A product piece is based on one original');
  const masterWidth = spriteMasterWidth(recipe.widthMeters);
  const texel = masterTexel(recipe, masterWidth);
  // A master texel m (continuous, from the left edge) lies at the source's crop + m · texel.
  const unreflected = composePieceTransform(one.transform, { scale: texel, x: recipe.crop.x, y: recipe.crop.y });
  if (!mirrored) return composePieceTransform(unreflected, shift);
  // The reflection's texel m is the master's masterWidth − m, and the body's q the reflected body's bodyWidth − q.
  return composePieceTransform(
    {
      scale: unreflected.scale,
      x: bodyWidth - unreflected.scale * masterWidth - unreflected.x,
      y: unreflected.y,
    },
    shift,
  );
}

/**
 * A baked picture's palettes, made once from its master's colors: one for each combination of the pieces' palettes
 * found at its sites, named by joining the pieces' palette names with `+` (`p045+p046`), the composed combination
 * (`base`) first with the master's own colors. Each product slot takes the piece and slot most often under it (the
 * lowest on a tie; the first piece's slot 1 where none is), and another combination colors it by that piece's slot's
 * color in its base palette becoming the combination's (`recolorSpriteColor`), as `alternateSpritePalettes` does for
 * one original.
 */
export function alternatePiecePalettes(
  product: PaletteFrame & { readonly palette: readonly number[] },
  provenance: Int32Array,
  pieces: readonly { readonly palettes: Readonly<Record<string, readonly number[]>> }[],
  base: readonly string[],
  combinations: readonly (readonly string[])[],
): Record<string, number[]> {
  if (provenance.length !== product.indices.length) throw new RangeError('Provenance is per master texel');
  const counts = Array.from({ length: 16 }, () => new Map<number, number>());
  product.indices.forEach((slot, i) => {
    const under = provenance[i]!;
    if (slot && under >= 0) counts[slot]!.set(under, (counts[slot]!.get(under) ?? 0) + 1);
  });
  const correspondence = counts.map((row) => {
    let best = 1,
      most = 0;
    for (const [under, count] of row)
      if (count > most || (count === most && under < best)) [best, most] = [under, count];
    return { piece: best >> 4, slot: best & 15 };
  });
  const name = (combination: readonly string[]) => combination.join('+');
  const colorsOf = (piece: number, palette: string) => {
    const colors = pieces[piece]?.palettes[palette];
    if (!colors) throw new RangeError(`Piece ${piece} has no palette ${palette}`);
    return colors;
  };
  const palettes: Record<string, number[]> = { [name(base)]: [...product.palette] };
  for (const combination of combinations) {
    if (name(combination) in palettes) continue;
    palettes[name(combination)] = product.palette.map((code, slot) => {
      if (!slot) return 0;
      const { piece, slot: under } = correspondence[slot]!;
      return recolorSpriteColor(
        code,
        colorsOf(piece, base[piece]!)[under]!,
        colorsOf(piece, combination[piece]!)[under]!,
      );
    });
  }
  return palettes;
}
