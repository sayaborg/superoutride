import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import { recipeOriginal, type SpriteRecipe, type SpriteRecipePiece } from './sprite-import.js';
import { masterTexelOnSource } from './sprite-source-compiler.js';

/** A frame's texels, each a palette slot, 0 transparent. */
export interface PaletteFrame {
  readonly width: number;
  readonly height: number;
  readonly indices: readonly number[];
}

/** Below this linear channel an original color gives no ratio, and its alternate is taken as it is. */
const NEAR_BLACK = 1e-6;

/**
 * Where a product master's texel centre lies in its original body: through the master's crop of the recipe's PNG
 * (`masterWidth` texels across it) and its one piece's `transform`, from a source pixel p to the body's `scale·p + (x, y)`.
 */
export function basedOnPosition(recipe: SpriteRecipe, masterWidth: number) {
  const original = recipeOriginal(recipe);
  if (!original) throw new RangeError('The recipe is based on no one original picture');
  return piecePosition(recipe, original, masterWidth);
}

/** Where a product master's texel centre lies in one piece's original body, through the crop and its `transform`. */
export function piecePosition(recipe: SpriteRecipe, piece: SpriteRecipePiece, masterWidth: number) {
  const { scale, x, y } = piece.transform;
  return (mx: number, my: number): readonly [number, number] => {
    const [sx, sy] = masterTexelOnSource(recipe, mx, my, masterWidth);
    return [scale * sx + x, scale * sy + y];
  };
}

/**
 * A product color `code` recolored as an original color `from` becomes `to`: per channel, the product's times the
 * ratio of `to` to `from` in linear light, clamped before RGB555; where `from`'s channel is near black, `to`'s is used
 * as it is.
 */
export function recolorSpriteColor(code: number, from: number, to: number): number {
  const channels = [10, 5, 0].map((shift) => {
    const denominator = rgb555LinearChannel((from >> shift) & 31),
      target = rgb555LinearChannel((to >> shift) & 31);
    return denominator < NEAR_BLACK
      ? target
      : Math.min(1, (rgb555LinearChannel((code >> shift) & 31) * target) / denominator);
  });
  return linearToRgb555(channels[0]!, channels[1]!, channels[2]!);
}

/**
 * A product picture's palettes made from its original's, under the original's names, the default first: the default
 * is the product's own colors; each alternate gives each product slot the original slot most often under it (the
 * lowest on a tie, slot 1 where none is), and colors it by that slot's default-to-alternate ratio
 * (`recolorSpriteColor`). A helper for making a recipe's palettes once; import never calls it.
 */
export function alternateSpritePalettes(
  product: PaletteFrame & { readonly palette: readonly number[] },
  position: (x: number, y: number) => readonly [number, number],
  original: PaletteFrame & {
    readonly defaultPalette: string;
    readonly palettes: Readonly<Record<string, readonly number[]>>;
  },
): Record<string, number[]> {
  const counts = Array.from({ length: 16 }, () => Array<number>(16).fill(0));
  for (let y = 0; y < product.height; y++)
    for (let x = 0; x < product.width; x++) {
      const slot = product.indices[y * product.width + x]!;
      if (!slot) continue;
      const [ox, oy] = position(x, y).map(Math.floor) as [number, number];
      const old =
        ox >= 0 && oy >= 0 && ox < original.width && oy < original.height
          ? original.indices[oy * original.width + ox]!
          : 0;
      if (old) counts[slot]![old] = counts[slot]![old]! + 1;
    }
  const correspondence = counts.map((row) => {
    let slot = 1;
    for (let i = 2; i < 16; i++) if (row[i]! > row[slot]!) slot = i;
    return slot;
  });
  const base = original.palettes[original.defaultPalette];
  if (!base) throw new RangeError('The original default palette is not one of its palettes');
  const alternate = (colors: readonly number[]) =>
    product.palette.map((code, slot) =>
      slot ? recolorSpriteColor(code, base[correspondence[slot]!]!, colors[correspondence[slot]!]!) : 0,
    );
  return Object.fromEntries([
    [original.defaultPalette, [...product.palette]],
    ...Object.entries(original.palettes)
      .filter(([name]) => name !== original.defaultPalette)
      .map(([name, colors]) => [name, alternate(colors)]),
  ]);
}
