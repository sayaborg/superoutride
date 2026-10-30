import { importSprite, type SpriteRecipe } from '../graphics/sprite-import.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';

/**
 * One sprite import off the page's thread: the master of `image` by `recipe` and its compiled levels, or the message of
 * its refusal.
 */
export interface SpriteImportRequest {
  readonly id: number;
  readonly image: SourceImage;
  readonly recipe: SpriteRecipe;
  readonly name: string;
}

self.addEventListener('message', ({ data }: MessageEvent<SpriteImportRequest>) => {
  try {
    const master = importSprite(data.image, data.recipe, data.name);
    self.postMessage({ id: data.id, master, lod: compileSpriteLod(master) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
});
