import type { SpriteLevel, SpriteLodAsset } from '../../src/image/sprite.js';
import type { PaletteFrame } from './sprite-alternate-palettes.js';
import { recipeOriginal, type SpriteRecipe, type SpriteRecipePiece } from './sprite-import.js';
import { masterMapping } from './sprite-source-compiler.js';
import { spriteLayers } from './sprite-layers.js';

/**
 * Each master texel's centre in one piece's original body, floored to the body's texel: the piece's `transform` after
 * the master's map to its source (`masterMapping`), worked out row by row and column by column, since the map is
 * separable, and the same arithmetic as `piecePosition`.
 */
function pieceTexels(recipe: SpriteRecipe, piece: SpriteRecipePiece, width: number, height: number) {
  const { toSource } = masterMapping(recipe, width);
  const { scale, x, y } = piece.transform;
  const columns = new Int32Array(width),
    rows = new Int32Array(height);
  for (let mx = 0; mx < width; mx++) columns[mx] = Math.floor(scale * toSource(mx, 0)[0] + x);
  for (let my = 0; my < height; my++) rows[my] = Math.floor(scale * toSource(0, my)[1] + y);
  return { columns, rows };
}

/**
 * A product picture's original body placed in its master's frame (`width` by `height` texels): each texel takes the
 * original body's slot under its centre through its piece's transform, 0 outside the body. Until the picture is redrawn
 * it is what the product shows, at the recipe's scale and anchor.
 */
export function placedOriginalBody(
  recipe: SpriteRecipe,
  master: { readonly width: number; readonly height: number },
  body: PaletteFrame,
): { readonly width: number; readonly height: number; readonly indices: Uint8Array } {
  const original = recipeOriginal(recipe);
  if (!original) throw new RangeError('The recipe is based on no one original picture');
  const { width, height } = master;
  const { columns, rows } = pieceTexels(recipe, original, width, height);
  const indices = new Uint8Array(width * height);
  for (let my = 0; my < height; my++) {
    const by = rows[my]!;
    if (by < 0 || by >= body.height) continue;
    for (let mx = 0; mx < width; mx++) {
      const bx = columns[mx]!;
      if (bx >= 0 && bx < body.width) indices[my * width + mx] = body.indices[by * body.width + bx]!;
    }
  }
  return { width, height, indices };
}

/**
 * A baked picture's pieces' original bodies placed in its master's frame, each through its piece's transform, a later
 * piece over an earlier one as they were composed: each texel's piece and slot, `piece · 16 + slot`, or −1 where no
 * body is. Until the picture is redrawn it is what the product shows.
 */
export function placedOriginalPieces(
  recipe: SpriteRecipe,
  master: { readonly width: number; readonly height: number },
  bodies: readonly PaletteFrame[],
): Int32Array {
  const pieces = recipe.basedOn ?? [];
  if (pieces.length !== bodies.length) throw new RangeError('Each piece has its body');
  const { width, height } = master;
  const provenance = new Int32Array(width * height).fill(-1);
  pieces.forEach((piece, n) => {
    const { columns, rows } = pieceTexels(recipe, piece, width, height),
      body = bodies[n]!;
    for (let my = 0; my < height; my++) {
      const by = rows[my]!;
      if (by < 0 || by >= body.height) continue;
      for (let mx = 0; mx < width; mx++) {
        const bx = columns[mx]!;
        const slot = bx >= 0 && bx < body.width ? body.indices[by * body.width + bx]! : 0;
        if (slot) provenance[my * width + mx] = n * 16 + slot;
      }
    }
  });
  return provenance;
}

/** Two frames of one extent: the texels opaque in both over the texels opaque in either (1 when neither has any). */
export function outlineIoU(a: PaletteFrame, b: PaletteFrame): number {
  if (a.width !== b.width || a.height !== b.height) throw new RangeError('Outlines are compared at one extent');
  let both = 0,
    either = 0;
  for (let i = 0; i < a.indices.length; i++) {
    const x = a.indices[i]! > 0,
      y = b.indices[i]! > 0;
    if (x || y) either++;
    if (x && y) both++;
  }
  return either ? both / either : 1;
}

/**
 * A product picture's outline against what it is based on (pictures 5 and 3): the IoU of its saved level's body (its
 * whole master) with its one original's body placed by the recipe, or a baked picture's pieces' bodies; `originals` in
 * the order of the recipe's pieces.
 */
export function productOutlineIoU(recipe: SpriteRecipe, level: SpriteLevel, originals: readonly SpriteLodAsset[]) {
  const body = spriteLayers(level, false, false).body;
  const bodies = originals.map((original) => spriteLayers(original.levels[0]!).body);
  if (recipeOriginal(recipe)) return outlineIoU(placedOriginalBody(recipe, level, bodies[0]!), body);
  const placed = placedOriginalPieces(recipe, level, bodies);
  return outlineIoU({ width: level.width, height: level.height, indices: placed.map((p) => (p >= 0 ? 1 : 0)) }, body);
}
