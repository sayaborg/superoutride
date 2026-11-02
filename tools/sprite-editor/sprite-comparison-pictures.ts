import { readSpriteLodAsset, type SpriteLevel, type SpriteLodAsset } from '../../src/image/sprite.js';
import { boardShadow } from '../graphics/board-shadow.js';
import { placedOriginalBody } from '../graphics/sprite-basis.js';
import { recipeOriginal, type SpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { assetOfBytes, type AssetBytes } from './sprite-import-bytes.js';
import { placedProduct } from './sprite-placing.js';
import { paintSlots, shadowWords, slotWords, type SlotRaster } from './slot-pixels.js';

/** What the page needs of an original: its master's extent and base point, its shadow frame's rows, its default palette. */
export interface OriginalShape {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly shadowHeight: number | null;
  readonly defaultPalette: string;
}

/**
 * Pictures 2, 3 and 5 of the comparison, made off the page's thread. `originals` are the original (one) or a baked
 * picture's pieces' originals in the recipe's order, each by the key of its file's revision and its bytes; `product` is a
 * product picture's master, the open source's import's level 0 as the import worker read it, by its import's key (its
 * bytes left out once the worker holds them, `ComparisonProducts`), and `recipe` its recipe, null for an original
 * picture; `palette` the palette chosen for pictures 2 and 5, null for each one's default.
 */
export interface ComparisonPicturesRequest {
  readonly id: number;
  readonly kind: 'pictures';
  readonly originals: readonly { readonly key: string; readonly bytes: Uint8Array<ArrayBuffer> }[];
  readonly product: { readonly key: string; readonly asset: AssetBytes | null } | null;
  readonly recipe: SpriteRecipe | null;
  readonly palette: string | null;
}

/** How many product masters the comparison's worker holds, the latest asked for; the page keeps the same count. */
export const COMPARISON_PRODUCTS = 8;
/** The refusal of a product asked for by its key alone that the worker no longer holds; the page sends its bytes. */
export const PRODUCT_NOT_HELD = 'The comparison holds no such product';

/** A picture's extent and base point in master texels, and its pixels drawn at one pixel a texel. */
export interface PictureData {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly image: ImageBitmap;
}

export interface ComparisonPictures {
  readonly originals: readonly OriginalShape[];
  /** Picture 2: the original over its shadow, or a baked picture's pieces' originals composed. */
  readonly original: PictureData;
  /** Picture 3: the original body placed by the recipe over the board shadow it casts; null for an original. */
  readonly placed: PictureData | null;
  /** Picture 5: the product master over its shadow; null for an original. */
  readonly product: PictureData | null;
  /** Picture 3's texels, whose outline every pane draws; null for an original. */
  readonly outline: (SlotRaster & { readonly anchorX: number; readonly anchorY: number }) | null;
}

/** A frame of slots with its base point. */
type SlotFrame = SlotRaster & { readonly anchorX: number; readonly anchorY: number };

// The originals read last, by key: a few, as the comparison goes from picture to picture and back.
const read = new Map<string, SpriteLodAsset>();
const original = (key: string, bytes: Uint8Array<ArrayBuffer>) => {
  let asset = read.get(key);
  if (!asset) {
    asset = readSpriteLodAsset(JSON.parse(new TextDecoder().decode(bytes)));
    read.set(key, asset);
    for (const old of read.keys()) if (read.size > 8) read.delete(old);
  }
  return asset;
};

// The product masters asked for last, by their imports' keys.
const products = new Map<string, SpriteLodAsset>();
const held = (key: string, asset: AssetBytes | null) => {
  let made = products.get(key);
  if (!made) {
    if (!asset) throw new RangeError(PRODUCT_NOT_HELD);
    made = assetOfBytes(asset);
  }
  // The latest asked for last, so the oldest goes first.
  products.delete(key);
  products.set(key, made);
  for (const old of products.keys()) if (products.size > COMPARISON_PRODUCTS) products.delete(old);
  return made;
};

/** Make the comparison's pictures 2, 3 and 5 as `request` asks (`ComparisonPicturesRequest`). */
export function comparisonPictures(request: ComparisonPicturesRequest): {
  readonly pictures: ComparisonPictures;
  readonly transfer: ImageBitmap[];
} {
  const originals = request.originals.map(({ key, bytes }) => original(key, bytes));
  const shapes = originals.map((asset): OriginalShape => {
    const level = asset.levels[0]!;
    return {
      width: level.width,
      height: level.height,
      anchorX: level.anchorX,
      anchorY: level.anchorY,
      shadowHeight: level.shadow?.height ?? null,
      defaultPalette: asset.defaultPalette,
    };
  });
  const { product, recipe, palette } = request;
  const transfer: ImageBitmap[] = [];
  const keep = (picture: PictureData) => (transfer.push(picture.image), picture);
  const master = product ? held(product.key, product.asset) : null;
  if (!master || !recipe) {
    // An original picture: picture 2 alone.
    const asset = originals[0]!;
    return {
      pictures: {
        originals: shapes,
        original: keep(levelPicture(asset.levels[0]!, palette ? asset.palettes[palette]?.colors : null, true)),
        placed: null,
        product: null,
        outline: null,
      },
      transfer,
    };
  }
  const level = master.levels[0]!;
  const caster = (frame: SlotFrame) =>
    recipe.shadow ? boardShadow({ ...frame, levels: [{ indices: frame.indices }] }) : null;
  let picture2: PictureData, placed: SlotFrame, colors: readonly number[];
  if (recipeOriginal(recipe)) {
    // A product of one original: picture 2 is the original itself, 3 its body placed by the recipe.
    const asset = originals[0]!;
    picture2 = levelPicture(asset.levels[0]!, palette ? asset.palettes[palette]?.colors : null, true);
    placed = {
      width: level.width,
      height: level.height,
      anchorX: level.anchorX,
      anchorY: level.anchorY,
      indices: placedOriginalBody(recipe, level, spriteLayers(asset.levels[0]!).body).indices,
    };
    colors = asset.palettes[asset.defaultPalette]!.colors;
  } else {
    // A baked picture: 2 and 3 are its pieces' originals composed through their transforms.
    const made = placedProduct(recipe, level, originals);
    placed = made.frame;
    colors = made.colors;
    picture2 = framePicture(placed, colors, null);
  }
  const shadow = caster(placed);
  return {
    pictures: {
      originals: shapes,
      original: keep(picture2),
      placed: keep(framePicture(placed, colors, shadow && { ...shadow, indices: shadow.levels[0]!.indices })),
      product: keep(levelPicture(level, palette ? master.palettes[palette]?.colors : null, false)),
      outline: placed,
    },
    transfer,
  };
}

/**
 * A course image level: its body in its colors (or `colors`, another palette's) over its shadow; an original's master
 * holds its shadow's texels, a product picture's does not (`shadowInMaster` false).
 */
function levelPicture(level: SpriteLevel, colors: readonly number[] | null | undefined, shadowInMaster: boolean) {
  const { body, shadow } = spriteLayers(level, false, shadowInMaster);
  return framePicture(body, colors ?? level.paletteRgb555, shadow);
}

/** A frame of slots in `colors` over a shadow, dark and half transparent, in one frame holding both. */
function framePicture(body: SlotFrame, colors: readonly number[], shadow: SlotFrame | null): PictureData {
  const dx = shadow ? Math.round(body.anchorX - shadow.anchorX) : 0,
    dy = shadow ? Math.round(body.anchorY - shadow.anchorY) : 0;
  const left = Math.min(0, dx),
    top = Math.min(0, dy);
  const width = Math.max(body.width, shadow ? dx + shadow.width : 0) - left,
    height = Math.max(body.height, shadow ? dy + shadow.height : 0) - top;
  const data = new ImageData(width, height);
  if (shadow) paintSlots(data, shadow, shadowWords(110), dx - left, dy - top);
  paintSlots(data, body, slotWords(colors), -left, -top);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return {
    width,
    height,
    anchorX: body.anchorX - left,
    anchorY: body.anchorY - top,
    image: canvas.transferToImageBitmap(),
  };
}
