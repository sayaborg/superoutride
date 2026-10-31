import { encodedByte } from '../../src/image/image-filter.js';
import { rgba } from '../../src/image/rgb555.js';
import { composePieceTransform, type SpriteRecipe } from './sprite-import.js';
import { sampleCropAt, spriteMasterWidth, type SourceImage } from './sprite-source-compiler.js';

/** A saved source holds this many of its pixels across each texel of its master. */
export const SAVED_SOURCE_TEXELS = 2;

/** Whether the saved source holds fewer than `SAVED_SOURCE_TEXELS` of its pixels across each master texel. */
export function sourceLowResolution(recipe: SpriteRecipe): boolean {
  return recipe.crop.width < SAVED_SOURCE_TEXELS * spriteMasterWidth(recipe.widthMeters);
}

/**
 * A source kept at the size a product picture's PNG is saved: only the recipe's crop, reduced to
 * `SAVED_SOURCE_TEXELS` times its master's width (never enlarged) by the linear-light area mean of straight-alpha
 * pixels, as normalization samples (a fractional last row padded with transparency). The recipe follows: its crop is the
 * whole reduced image, its anchor maps by pixel edges and each piece's `transform` composes with the reduction. A source is
 * reduced before any mask is drawn on it, so a recipe with a mask is refused.
 */
export function reduceSpriteSource(
  image: SourceImage,
  recipe: SpriteRecipe,
): { readonly image: SourceImage; readonly recipe: SpriteRecipe } {
  if (recipe.mask.length) throw new RangeError('A source is reduced before any mask is drawn on it');
  const { crop } = recipe;
  const width = Math.min(crop.width, SAVED_SOURCE_TEXELS * spriteMasterWidth(recipe.widthMeters));
  const { height, samples } = sampleCropAt(image, crop, width);
  const pixels = Uint32Array.from(samples, (s) =>
    rgba(encodedByte(s.red), encodedByte(s.green), encodedByte(s.blue), Math.round(Math.min(1, s.coverage) * 255)),
  );
  // New pixel edges q lie at the old crop's x + q / factor.
  const factor = width / crop.width;
  const edge = (value: number, origin: number) => (value + 0.5 - origin) * factor - 0.5;
  const basedOn = recipe.basedOn?.map((piece) => ({
    ...piece,
    transform: composePieceTransform(piece.transform, { scale: 1 / factor, x: crop.x, y: crop.y }),
  }));
  return {
    image: { width, height, pixels },
    recipe: {
      ...recipe,
      crop: { x: 0, y: 0, width, height },
      anchor: {
        x: edge(recipe.anchor.x, crop.x),
        ...(recipe.anchor.y === undefined ? {} : { y: edge(recipe.anchor.y, crop.y) }),
      },
      ...(basedOn ? { basedOn } : {}),
    },
  };
}
