import { PNG } from 'pngjs';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { writeZip, type ZipEntry } from '../browser-shared/zip.js';
import { generationInput } from '../graphics/sprite-generation.js';
import { readSpriteRecipe } from '../graphics/sprite-import.js';
import { encodeSpritePng } from '../graphics/sprite-png.js';
import { placedOriginal, placedProduct } from './sprite-placing.js';

/**
 * One picture's generation input, from its files' bytes: its saved image (`image`); for a product picture its recipe
 * and its pieces' original images, in the recipe's order (none for an original picture); the collision widths its guide
 * draws, and its prompt.
 */
export interface GenerationPicture {
  readonly original: string;
  readonly image: Uint8Array<ArrayBuffer>;
  readonly recipe: Uint8Array<ArrayBuffer> | null;
  readonly originals: readonly Uint8Array<ArrayBuffer>[];
  readonly widths: readonly number[];
  readonly prompt: string;
}

/** The generation input of `pictures`, made and zipped off the page's thread (`generationZip`). */
export interface GenerationRequest {
  readonly id: number;
  readonly kind: 'generation';
  readonly pictures: readonly GenerationPicture[];
}

const json = (bytes: Uint8Array<ArrayBuffer>) => JSON.parse(new TextDecoder().decode(bytes)) as unknown;

/**
 * The zip of each picture's `<original>-input.png` and `-guide.png` (`generationInput` of its picture 3: an original's
 * own body, a product's original bodies placed by its recipe at its saved image's extent and base point) and
 * `-prompt.txt`, with how many files it holds.
 */
export function generationZip(request: GenerationRequest): {
  readonly zip: Uint8Array<ArrayBuffer>;
  readonly files: number;
} {
  const entries: ZipEntry[] = [];
  for (const picture of request.pictures) {
    const asset = readSpriteLodAsset(json(picture.image));
    const placed = picture.recipe
      ? placedProduct(
          readSpriteRecipe(json(picture.recipe)),
          asset.levels[0]!,
          picture.originals.map((bytes) => readSpriteLodAsset(json(bytes))),
        )
      : placedOriginal(asset);
    const { input, guide } = generationInput(placed.frame, placed.colors, picture.widths);
    entries.push(
      { name: `${picture.original}-input.png`, bytes: encodeSpritePng(input, PNG) },
      { name: `${picture.original}-guide.png`, bytes: encodeSpritePng(guide, PNG) },
      { name: `${picture.original}-prompt.txt`, bytes: new TextEncoder().encode(picture.prompt) },
    );
  }
  return { zip: writeZip(entries), files: entries.length };
}
