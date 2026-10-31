import type { SpriteLevel, SpriteLodAsset } from '../../src/image/sprite.js';
import { basedOnPosition, piecePosition, type PaletteFrame } from './sprite-alternate-palettes.js';
import { recipeOriginal, type SpriteRecipe } from './sprite-import.js';
import { spriteLayers } from './sprite-layers.js';

/**
 * A product picture's original body placed in its master's frame (`width` by `height` texels): each texel takes the
 * original body's slot under its centre through `basedOnPosition`, 0 outside the body. Until the picture is redrawn it
 * is what the product shows, at the recipe's scale and anchor.
 */
export function placedOriginalBody(
  recipe: SpriteRecipe,
  master: { readonly width: number; readonly height: number },
  body: PaletteFrame,
): PaletteFrame {
  const position = basedOnPosition(recipe, master.width);
  const indices = Array.from({ length: master.width * master.height }, (_, i) => {
    const [x, y] = position(i % master.width, Math.floor(i / master.width)).map(Math.floor) as [number, number];
    return x >= 0 && y >= 0 && x < body.width && y < body.height ? body.indices[y * body.width + x]! : 0;
  });
  return { width: master.width, height: master.height, indices };
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
  const provenance = new Int32Array(master.width * master.height).fill(-1);
  pieces.forEach((piece, n) => {
    const position = piecePosition(recipe, piece, master.width),
      body = bodies[n]!;
    for (let i = 0; i < provenance.length; i++) {
      const [x, y] = position(i % master.width, Math.floor(i / master.width)).map(Math.floor) as [number, number];
      const slot = x >= 0 && y >= 0 && x < body.width && y < body.height ? body.indices[y * body.width + x]! : 0;
      if (slot) provenance[i] = n * 16 + slot;
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
  return outlineIoU(
    { width: level.width, height: level.height, indices: [...placed].map((p) => (p >= 0 ? 1 : 0)) },
    body,
  );
}
