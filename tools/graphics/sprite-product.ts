import { contentDigest } from '../../src/core/content-digest.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodAsset } from '../../src/image/sprite.js';
import { spriteBodyPng } from './sprite-body-png.js';
import { SPRITE_RECIPE_FORMAT, SPRITE_RECIPE_VERSION, type SpriteRecipe } from './sprite-import.js';
import { spriteLayers } from './sprite-layers.js';

/**
 * The product picture first made from the original picture `original` (`asset`), looking as the original does: its
 * body PNG (`spriteBodyPng`) and a recipe importing the whole PNG at one texel a pixel with the original's anchor, its
 * palettes under their names (the default first), `shadow: "board"` when the original has a shadow, `mirror` when the
 * course also shows the reflection, and `basedOn` the original with the PNG's digest and the identity transform.
 */
export async function originalProductSource(
  asset: SpriteLodAsset,
  original: string,
  mirror: boolean,
): Promise<{ readonly png: Uint8Array<ArrayBuffer>; readonly recipe: SpriteRecipe }> {
  const level = asset.levels[0]!;
  const { body, shadow } = spriteLayers(level);
  const png = spriteBodyPng(asset);
  const names = [asset.defaultPalette, ...Object.keys(asset.palettes).filter((name) => name !== asset.defaultPalette)];
  return {
    png,
    recipe: {
      format: SPRITE_RECIPE_FORMAT,
      version: SPRITE_RECIPE_VERSION,
      crop: { x: 0, y: 0, width: body.width, height: body.height },
      widthMeters: body.width / SPRITE_SOURCE_TEXELS_PER_METER,
      anchor: { x: body.anchorX, y: body.anchorY },
      mask: [],
      palettes: Object.fromEntries(names.map((name) => [name, asset.palettes[name]!.colors])),
      ...(shadow ? { shadow: 'board' as const } : {}),
      ...(mirror ? { mirror: true as const } : {}),
      basedOn: {
        image: original,
        bodySha256: await contentDigest(png),
        transform: { scale: 1, x: 0, y: 0 },
      },
    },
  };
}
