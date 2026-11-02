import type { SpriteLodAsset } from '../../src/image/sprite.js';
import type { SpriteRecipe } from '../graphics/sprite-import.js';
import { placedOriginalPieces } from '../graphics/sprite-basis.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import type { GenerationFrame } from '../graphics/sprite-generation.js';

/** Picture 3 of a course picture and the originals it is placed from. */
export interface PlacedPicture {
  /** Its texels as indices into `colors`, 0 transparent, with the master's base point. */
  readonly frame: GenerationFrame;
  readonly colors: readonly number[];
  /** The original (one), or a baked picture's pieces' originals in their order. */
  readonly originals: readonly SpriteLodAsset[];
  /** Each texel's piece and slot of its original, `piece · 16 + slot`, or −1 where none is. */
  readonly provenance: Int32Array;
}

/** Picture 3 of an original picture: its own body, in its default colors. */
export function placedOriginal(asset: SpriteLodAsset): PlacedPicture {
  const body = spriteLayers(asset.levels[0]!).body;
  return {
    frame: body,
    colors: asset.palettes[asset.defaultPalette]!.colors,
    originals: [asset],
    provenance: Int32Array.from(body.indices, (slot) => (slot ? slot : -1)),
  };
}

/**
 * Picture 3 of a product picture: its pieces' original bodies placed by `recipe` at `level`'s extent and base point
 * (`placedOriginalPieces`), each in its original's default colors or, a baked piece, the palette it was baked in; one
 * palette for all pieces, piece n's slot s at n · 16 + s. `originals` are the pieces' in the recipe's order.
 */
export function placedProduct(
  recipe: SpriteRecipe,
  level: { readonly width: number; readonly height: number; readonly anchorX: number; readonly anchorY: number },
  originals: readonly SpriteLodAsset[],
): PlacedPicture {
  const pieces = recipe.basedOn ?? [];
  const bodies = originals.map((original) => spriteLayers(original.levels[0]!).body);
  const provenance = placedOriginalPieces(recipe, level, bodies);
  const colors = originals.flatMap((original, n) => {
    const palette = pieces[n]!.placement?.palette ?? original.defaultPalette;
    return [...(original.palettes[palette] ?? original.palettes[original.defaultPalette]!).colors];
  });
  return {
    frame: {
      width: level.width,
      height: level.height,
      anchorX: level.anchorX,
      anchorY: level.anchorY,
      indices: Array.from(provenance, (under) => (under >= 0 ? under : 0)),
    },
    colors,
    originals,
    provenance,
  };
}
