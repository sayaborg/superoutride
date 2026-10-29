import type { SpriteLodDocument } from '../../src/image/sprite.js';
import type { SpriteRecipe } from '../graphics/sprite-import.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteImportRequest } from './sprite-import-worker.js';

/**
 * Sprite imports in a worker (the color rule takes up to a second on the largest sources), found from the build root as
 * the editing frame finds its workers. An import of the same source bytes and recipe is answered from the last ones
 * made. `key` names the source's bytes (its digest).
 */
export function createSpriteImporter() {
  const worker = new Worker(new URL('../../tools/workbench/sprite-import-worker.js', location.href), {
    type: 'module',
  });
  const waiting = new Map<number, { resolve: (master: SpriteLodDocument) => void; reject: (error: Error) => void }>();
  worker.addEventListener(
    'message',
    ({ data }: MessageEvent<{ id: number; master?: SpriteLodDocument; error?: string }>) => {
      const request = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.master) request?.resolve(data.master);
      else request?.reject(new RangeError(data.error));
    },
  );
  const made = new Map<string, Promise<SpriteLodDocument>>();
  let id = 0;
  return (key: string, image: SourceImage, recipe: SpriteRecipe, name: string): Promise<SpriteLodDocument> => {
    const input = `${key} ${name} ${JSON.stringify(recipe)}`;
    const found = made.get(input);
    if (found) return found;
    const result = new Promise<SpriteLodDocument>((resolve, reject) => {
      waiting.set(++id, { resolve, reject });
      worker.postMessage({ id, image, recipe, name } satisfies SpriteImportRequest);
    });
    made.set(input, result);
    // A few recent imports are kept: undo and redo come back to them.
    for (const old of made.keys()) if (made.size > 8) made.delete(old);
    result.catch(() => made.delete(input));
    return result;
  };
}
