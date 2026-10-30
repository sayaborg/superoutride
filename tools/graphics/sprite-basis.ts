import { basedOnPosition, type PaletteFrame } from './sprite-alternate-palettes.js';
import type { SpriteRecipe } from './sprite-import.js';

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
