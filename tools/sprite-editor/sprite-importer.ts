import type { SpriteLodAsset } from '../../src/image/sprite.js';
import { assetOfBytes, type AssetBytes, type MasterBytes } from './sprite-import-bytes.js';
import type { SpriteRecipe } from '../graphics/sprite-import.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { PieceAlignRequest, PngDecodeRequest, SpriteImportRequest } from './sprite-import-worker.js';
import type { PieceAlignment } from '../graphics/sprite-bake-align.js';
import type {
  BakePictureRequest,
  OriginalProductRequest,
  PalettesRequest,
  PngRegisterRequest,
  PngRegistered,
  bakePicture,
  originalProduct,
} from './sprite-registering.js';
import type { generationZip, GenerationRequest } from './sprite-generation-export.js';
import { createWorkerRequests } from './worker-requests.js';

/**
 * An import, made and read in the worker: its key (the source's bytes, name and recipe), the master, its compiled levels
 * as the worker read them (`bytes`) and made again on the page (`asset`, which every redraw shares), and the course image
 * files it writes.
 */
export interface SpriteImport {
  readonly key: string;
  readonly master: MasterBytes;
  readonly bytes: AssetBytes;
  readonly asset: SpriteLodAsset;
  readonly files: readonly { readonly path: string; readonly bytes: Uint8Array<ArrayBuffer> }[];
}

export type SpriteImporter = ReturnType<typeof createSpriteImporter>;

/**
 * Sprite imports in a worker, which also compiles each master's levels (the color rule and the levels take up to a few
 * seconds on the largest sources). An import of the same source bytes and recipe is answered from the last eight made.
 * `key` names the source's bytes (its digest). A worker that fails is started again a few times
 * (`createWorkerRequests`).
 */
export function createSpriteImporter() {
  const made = new Map<string, Promise<SpriteImport>>();
  const ask = createWorkerRequests<{
    id: number;
    master: MasterBytes;
    asset: AssetBytes;
    files: SpriteImport['files'];
    error?: string;
  }>('../../tools/sprite-editor/sprite-import-worker.js', 'import', () => made.clear());
  const importer = (key: string, image: SourceImage, recipe: SpriteRecipe, name: string): Promise<SpriteImport> => {
    const input = `${key} ${name} ${JSON.stringify(recipe)}`;
    const found = made.get(input);
    if (found) return found;
    const result = ask({ image, recipe, name } satisfies Omit<SpriteImportRequest, 'id'>).then(
      ({ master, asset, files }): SpriteImport => ({
        key: input,
        master,
        bytes: asset,
        asset: assetOfBytes(asset),
        files,
      }),
    );
    made.set(input, result);
    // A few recent imports are kept: undo and redo come back to them.
    for (const old of made.keys()) if (made.size > 8) made.delete(old);
    result.catch(() => made.delete(input));
    return result;
  };
  // PNGs are decoded and registered in a second worker of the same script, so an import never waits behind them.
  const png = createWorkerRequests<
    {
      id: number;
      image: SourceImage;
      palettes: Record<string, number[]>;
      baked: Awaited<ReturnType<typeof bakePicture>>;
      alignment: PieceAlignment;
      first: Awaited<ReturnType<typeof originalProduct>>;
      generation: ReturnType<typeof generationZip>;
      error?: string;
    } & PngRegistered
  >('../../tools/sprite-editor/sprite-import-worker.js', 'PNG');
  return Object.assign(importer, {
    /** A source PNG's pixels (`decodeSpritePng`), so the page never waits on it. */
    decode: (bytes: Uint8Array<ArrayBuffer>) =>
      png({ kind: 'decode', bytes } satisfies Omit<PngDecodeRequest, 'id'>).then(({ image }) => image),
    /** K's PNG registered, kept at its saved size and colored (`registerPng`). */
    register: (request: Omit<PngRegisterRequest, 'id' | 'kind'>): Promise<PngRegistered> =>
      png({ kind: 'register', ...request } satisfies Omit<PngRegisterRequest, 'id'>).then(
        ({ png: bytes, image, recipe, iou, edges }) => ({ png: bytes, image, recipe, iou, edges }),
      ),
    /** An original's product source from its saved image's bytes, with the PNG's pixels (`originalProduct`). */
    originalProduct: (request: Omit<OriginalProductRequest, 'id' | 'kind'>) =>
      png({ kind: 'original product', ...request } satisfies Omit<OriginalProductRequest, 'id'>).then(
        ({ first }) => first,
      ),
    /** The generation input of `pictures`, zipped (`generationZip`). */
    generation: (pictures: GenerationRequest['pictures']) =>
      png({ kind: 'generation', pictures } satisfies Omit<GenerationRequest, 'id'>).then(
        ({ generation }) => generation,
      ),
    /** A baked picture's PNG, finished recipe and course image files (`bakePicture`). */
    bake: (request: Omit<BakePictureRequest, 'id' | 'kind'>) =>
      png({ kind: 'bake', ...request } satisfies Omit<BakePictureRequest, 'id'>).then(({ baked }) => baked),
    /** Baking's pieces moved where their seams match best (`alignBakePieces`). */
    align: (pieces: PieceAlignRequest['pieces']) =>
      png({ kind: 'align', pieces } satisfies Omit<PieceAlignRequest, 'id'>).then(({ alignment }) => alignment),
    /** A product master's alternate palettes made again from its default (`remadePalettes`). */
    palettes: (request: Omit<PalettesRequest, 'id' | 'kind'>) =>
      png({ kind: 'palettes', ...request } satisfies Omit<PalettesRequest, 'id'>).then(({ palettes }) => palettes),
  });
}
