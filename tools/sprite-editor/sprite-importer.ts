import { readSpriteLodAsset, type SpriteLodAsset, type SpriteLodDocument } from '../../src/image/sprite.js';
import type { SpriteRecipe } from '../graphics/sprite-import.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteImportRequest } from './sprite-import-worker.js';

/**
 * An import: the master, its compiled levels, the asset read from them once, which every redraw shares, and the course
 * image files it writes, all made in the worker.
 */
export interface SpriteImport {
  readonly master: SpriteLodDocument;
  readonly lod: SpriteLodDocument;
  readonly asset: SpriteLodAsset;
  readonly files: readonly { readonly path: string; readonly bytes: Uint8Array<ArrayBuffer> }[];
}

export type SpriteImporter = ReturnType<typeof createSpriteImporter>;

/** Failures of the import worker in a row, with no answer between, after which it is not started again. */
const WORKER_TRIES = 3;

/**
 * Sprite imports in a worker, which also compiles each master's levels (the color rule and the levels take up to a few
 * seconds on the largest sources), found from the build root as the editing frame finds its workers. An import of the
 * same source bytes and recipe is answered from the last eight made. `key` names the source's bytes (its digest). A
 * worker that fails refuses what it was asking and is started again, so the page's redraws go on; after
 * `WORKER_TRIES` failures with no answer between (a worker that cannot load), it is not started again: K is told once,
 * and every import is refused with the reason.
 */
export function createSpriteImporter() {
  const waiting = new Map<number, { resolve: (made: SpriteImport) => void; reject: (error: Error) => void }>();
  let worker: Worker,
    // Failures since the worker last answered, and the reason it was given up, once it is.
    failures = 0,
    givenUp: string | null = null;
  const start = () => {
    worker = new Worker(new URL('../../tools/sprite-editor/sprite-import-worker.js', location.href), {
      type: 'module',
    });
    worker.addEventListener(
      'message',
      ({
        data,
      }: MessageEvent<{
        id: number;
        master?: SpriteLodDocument;
        lod?: SpriteLodDocument;
        files?: SpriteImport['files'];
        error?: string;
      }>) => {
        failures = 0;
        const request = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.master && data.lod && data.files)
          request?.resolve({
            master: data.master,
            lod: data.lod,
            asset: readSpriteLodAsset(data.lod),
            files: data.files,
          });
        else request?.reject(new RangeError(data.error));
      },
    );
    const failed = (message: string) => {
      worker.terminate();
      for (const request of waiting.values()) request.reject(new Error(`The import worker failed: ${message}`));
      waiting.clear();
      made.clear();
      if (++failures < WORKER_TRIES) return start();
      givenUp = `The import worker failed ${failures} times in a row (${message}); reload the page to try again.`;
      alert(givenUp);
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
    if (givenUp) return Promise.reject(new Error(givenUp));
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
