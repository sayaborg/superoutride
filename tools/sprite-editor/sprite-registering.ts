import { PNG } from 'pngjs';
import { readSpriteLodAsset, type SpriteLodAsset, type SpriteLodDocument } from '../../src/image/sprite.js';
import { alternateSpritePalettes, basedOnPosition } from '../graphics/sprite-alternate-palettes.js';
import { alternatePiecePalettes } from '../graphics/sprite-bake.js';
import { placedOriginalPieces } from '../graphics/sprite-basis.js';
import { importSprite, type SpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { decodeSpritePng, encodeSpritePng } from '../graphics/sprite-png.js';
import { originalProductSource, registeredProductSource } from '../graphics/sprite-product.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import { placedOriginal, placedProduct } from './sprite-placing.js';

/** An original's file by the key of its revision, which a worker keeps a few of. */
export interface OriginalFile {
  readonly key: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const read = new Map<string, SpriteLodAsset>();
/** The originals of `files`, each read once for its key (the last few kept). */
export function readOriginals(files: readonly OriginalFile[]): SpriteLodAsset[] {
  return files.map(({ key, bytes }) => {
    let asset = read.get(key);
    if (!asset) {
      asset = readSpriteLodAsset(JSON.parse(new TextDecoder().decode(bytes)));
      read.set(key, asset);
      for (const old of read.keys()) if (read.size > 8) read.delete(old);
    }
    return asset;
  });
}

/**
 * The product picture's palettes made once from its master's colors: the default its import chose by the color rule
 * and the alternates made from its original's palettes under their names (`alternateSpritePalettes`); a baked
 * picture's, one for each combination of its pieces' palettes it has (`names`, the first the default), from its pieces'
 * (`alternatePiecePalettes`).
 */
export function productPalettes(
  master: SpriteLodDocument,
  recipe: SpriteRecipe,
  originals: readonly SpriteLodAsset[],
  names: readonly string[],
) {
  const level = master.levels[0]!;
  const product = { width: master.width, height: master.height, indices: level.indices, palette: level.paletteRgb555 };
  const palettesOf = (original: SpriteLodAsset) =>
    Object.fromEntries(Object.entries(original.palettes).map(([name, { colors }]) => [name, colors]));
  if (originals.length === 1) {
    const original = originals[0]!;
    return alternateSpritePalettes(product, basedOnPosition(recipe, master.width), {
      ...spriteLayers(original.levels[0]!).body,
      defaultPalette: original.defaultPalette,
      palettes: palettesOf(original),
    });
  }
  const bodies = originals.map((original) => spriteLayers(original.levels[0]!).body);
  const [base, ...others] = names.map((name) => name.split('+'));
  if (!base) throw new RangeError('A baked picture names its palettes');
  return alternatePiecePalettes(
    product,
    placedOriginalPieces(recipe, master, bodies),
    originals.map((original) => ({ palettes: palettesOf(original) })),
    base,
    others,
  );
}

/**
 * K's PNG registered to a picture's picture 3 off the page's thread. `recipe` and `image` are the product picture's (its
 * recipe and its saved image, whose master's extent and base point it keeps), or null for a product picture made now from `original` (its
 * name, its reflection when `mirrored`): its picture 3 is then the original's own body and its recipe the one
 * `originalProductSource` makes. `originals` are the pieces' (or the original's) files in the recipe's order.
 */
export interface PngRegisterRequest {
  readonly id: number;
  readonly kind: 'register';
  readonly png: Uint8Array<ArrayBuffer>;
  readonly name: string;
  readonly original: string;
  readonly mirrored: boolean;
  readonly recipe: SpriteRecipe | null;
  /** The product picture's saved image, whose master's extent and base point picture 3 takes. */
  readonly image: Uint8Array<ArrayBuffer> | null;
  readonly originals: readonly OriginalFile[];
  readonly keepPalettes: boolean;
}

/** A registration's result: the PNG at its saved size, its pixels and recipe, and how its outline met picture 3. */
export interface PngRegistered {
  readonly png: Uint8Array<ArrayBuffer>;
  readonly image: SourceImage;
  readonly recipe: SpriteRecipe;
  readonly iou: number;
  readonly edges: ReturnType<typeof registeredProductSource>['edges'];
}

/**
 * Register K's PNG (`registeredProductSource`) as `request` says, keep it at its saved size, encode it, and choose its
 * colors once with its alternate palettes (`productPalettes`), or keep the recipe's.
 */
export async function registerPng(request: PngRegisterRequest): Promise<PngRegistered> {
  const image = await decodeSpritePng(request.png, PNG);
  const originals = readOriginals(request.originals);
  const current =
    request.recipe ?? (await originalProductSource(originals[0]!, request.original, request.mirrored)).recipe;
  const placed =
    request.recipe && request.image
      ? placedProduct(
          request.recipe,
          readSpriteLodAsset(JSON.parse(new TextDecoder().decode(request.image))).levels[0]!,
          originals,
        )
      : placedOriginal(originals[0]!);
  const registered = registeredProductSource(image, current, placed.frame);
  const palettes = request.keepPalettes
    ? current.palettes
    : productPalettes(
        importSprite(registered.image, registered.recipe, request.name),
        registered.recipe,
        originals,
        Object.keys(current.palettes ?? {}),
      );
  return {
    png: encodeSpritePng(registered.image, PNG),
    image: registered.image,
    recipe: { ...registered.recipe, palettes },
    iou: registered.iou,
    edges: registered.edges,
  };
}

/** The alternate palettes of a product picture's master made again from its default (`productPalettes`). */
export interface PalettesRequest {
  readonly id: number;
  readonly kind: 'palettes';
  readonly master: SpriteLodDocument;
  readonly recipe: SpriteRecipe;
  readonly originals: readonly OriginalFile[];
}

export function remadePalettes(request: PalettesRequest) {
  return productPalettes(
    request.master,
    request.recipe,
    readOriginals(request.originals),
    Object.keys(request.recipe.palettes ?? {}),
  );
}
