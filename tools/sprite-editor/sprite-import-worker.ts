import { PNG } from 'pngjs';
import { importedImageFiles, importSprite, type SpriteRecipe } from '../graphics/sprite-import.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import {
  bakePicture,
  originalProduct,
  registerPng,
  remadePalettes,
  type BakePictureRequest,
  type OriginalProductRequest,
  type PalettesRequest,
  type PngRegisterRequest,
} from './sprite-registering.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { assetBytes, masterBytes } from './sprite-import-bytes.js';
import { generationZip, type GenerationRequest } from './sprite-generation-export.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';

/**
 * One sprite import off the page's thread: the master of `image` by `recipe`, its compiled levels read as a course image
 * and the course image files the import writes (`importedImageFiles`), handed over as bytes; or the message of its
 * refusal.
 */
export interface SpriteImportRequest {
  readonly id: number;
  readonly image: SourceImage;
  readonly recipe: SpriteRecipe;
  readonly name: string;
}

/** A source PNG decoded off the page's thread (`decodeSpritePng`): its pixels, or the message of its refusal. */
export interface PngDecodeRequest {
  readonly id: number;
  readonly kind: 'decode';
  readonly bytes: Uint8Array<ArrayBuffer>;
}

self.addEventListener(
  'message',
  async ({
    data,
  }: MessageEvent<
    | SpriteImportRequest
    | PngDecodeRequest
    | PngRegisterRequest
    | PalettesRequest
    | BakePictureRequest
    | OriginalProductRequest
    | GenerationRequest
  >) => {
    if ('kind' in data) {
      try {
        if (data.kind === 'decode') {
          const image = await decodeSpritePng(data.bytes, PNG);
          self.postMessage({ id: data.id, image }, { transfer: [image.pixels.buffer] });
        } else if (data.kind === 'register') {
          const registered = await registerPng(data);
          self.postMessage({ id: data.id, ...registered });
        } else if (data.kind === 'generation') {
          const made = generationZip(data);
          self.postMessage({ id: data.id, generation: made }, { transfer: [made.zip.buffer] });
        } else if (data.kind === 'original product') {
          const made = await originalProduct(data);
          self.postMessage({ id: data.id, first: made }, { transfer: [made.png.buffer, made.image.pixels.buffer] });
        } else if (data.kind === 'bake') {
          self.postMessage({ id: data.id, baked: await bakePicture(data) });
        } else self.postMessage({ id: data.id, palettes: remadePalettes(data) });
      } catch (error) {
        self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    try {
      // The import's levels read once, here; the page is handed them as bytes, which it reads nothing of again.
      const master = importSprite(data.image, data.recipe, data.name);
      const lod = compileSpriteLod(master);
      const files = importedImageFiles(data.recipe, master, lod);
      const asset = assetBytes(readSpriteLodAsset(lod));
      const made = masterBytes(master);
      self.postMessage(
        { id: data.id, master: made.master, asset: asset.asset, files },
        { transfer: [...made.transfer, ...asset.transfer, ...files.map((file) => file.bytes.buffer)] },
      );
    } catch (error) {
      self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
