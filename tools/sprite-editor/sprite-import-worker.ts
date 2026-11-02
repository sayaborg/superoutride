import { PNG } from 'pngjs';
import { importedImageFiles, importSprite, type SpriteRecipe } from '../graphics/sprite-import.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import { registerPng, remadePalettes, type PalettesRequest, type PngRegisterRequest } from './sprite-registering.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';

/**
 * One sprite import off the page's thread: the master of `image` by `recipe`, its compiled levels and the course image
 * files the import writes (`importedImageFiles`), or the message of its refusal.
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
  async ({ data }: MessageEvent<SpriteImportRequest | PngDecodeRequest | PngRegisterRequest | PalettesRequest>) => {
    if ('kind' in data) {
      try {
        if (data.kind === 'decode') {
          const image = await decodeSpritePng(data.bytes, PNG);
          self.postMessage({ id: data.id, image }, { transfer: [image.pixels.buffer] });
        } else if (data.kind === 'register') {
          const registered = await registerPng(data);
          self.postMessage({ id: data.id, ...registered });
        } else self.postMessage({ id: data.id, palettes: remadePalettes(data) });
      } catch (error) {
        self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    try {
      const master = importSprite(data.image, data.recipe, data.name);
      const lod = compileSpriteLod(master);
      self.postMessage({ id: data.id, master, lod, files: importedImageFiles(data.recipe, master, lod) });
    } catch (error) {
      self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
