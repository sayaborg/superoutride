import { readSpriteLodAsset, type SpriteLodAsset, type SpriteLodDocument } from '../../src/image/sprite.js';
import type { SpriteRecipe } from '../graphics/sprite-import.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteImportRequest } from './sprite-import-worker.js';

/** An import: the master, its compiled levels and the asset read from them once, which every redraw shares. */
export interface SpriteImport {
  readonly master: SpriteLodDocument;
  readonly lod: SpriteLodDocument;
  readonly asset: SpriteLodAsset;
}

export type SpriteImporter = ReturnType<typeof createSpriteImporter>;

/**
 * Sprite imports in a worker, which also compiles each master's levels (the color rule and the levels take up to a few
 * seconds on the largest sources), found from the build root as the editing frame finds its workers. An import of the
 * same source bytes and recipe is answered from the last eight made. `key` names the source's bytes (its digest). A
 * worker that fails refuses what it was asking and is started again, so the page's redraws go on.
 */
export function createSpriteImporter() {
  const waiting = new Map<number, { resolve: (made: SpriteImport) => void; reject: (error: Error) => void }>();
  let worker: Worker;
  const start = () => {
    worker = new Worker(new URL('../../tools/sprite-editor/sprite-import-worker.js', location.href), {
      type: 'module',
    });
    worker.addEventListener(
      'message',
      ({ data }: MessageEvent<{ id: number; master?: SpriteLodDocument; lod?: SpriteLodDocument; error?: string }>) => {
        const request = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.master && data.lod)
          request?.resolve({ master: data.master, lod: data.lod, asset: readSpriteLodAsset(data.lod) });
        else request?.reject(new RangeError(data.error));
      },
    );
    const failed = (message: string) => {
      worker.terminate();
      for (const request of waiting.values()) request.reject(new Error(`The import worker failed: ${message}`));
      waiting.clear();
      made.clear();
      start();
    };
    worker.addEventListener('error', (event) => failed(event.message || 'it could not run'));
    worker.addEventListener('messageerror', () => failed('a message could not be read'));
  };
  const made = new Map<string, Promise<SpriteImport>>();
  let id = 0;
  start();
  return (key: string, image: SourceImage, recipe: SpriteRecipe, name: string): Promise<SpriteImport> => {
    const input = `${key} ${name} ${JSON.stringify(recipe)}`;
    const found = made.get(input);
    if (found) return found;
    const result = new Promise<SpriteImport>((resolve, reject) => {
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
