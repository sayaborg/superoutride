import { contentDigest } from '../../src/core/content-digest.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodAsset } from '../../src/image/sprite.js';
import { spriteBodyPng } from './sprite-body-png.js';
import {
  composePieceTransform,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  type SpriteRecipe,
} from './sprite-import.js';
import { spriteLayers } from './sprite-layers.js';
import { registerSpriteSource } from './sprite-registration.js';
import type { SourceImage } from './sprite-source-compiler.js';
import { reduceSpriteSource } from './sprite-source-size.js';

/**
 * The product picture first made from the original picture `original` (`asset`), looking as the original does: its
 * body PNG (`spriteBodyPng`) and a recipe importing the whole PNG at one texel a pixel with the original's anchor, its
 * palettes under their names (the default first), `shadow: "board"` when the original has a shadow, `mirror` when the
 * course also shows the reflection, and `basedOn` one piece: the original with the PNG's digest and the identity transform.
 */
export async function originalProductSource(
  asset: SpriteLodAsset,
  original: string,
  mirror: boolean,
): Promise<{ readonly png: Uint8Array<ArrayBuffer>; readonly recipe: SpriteRecipe }> {
  const level = asset.levels[0]!;
  const { body, shadow } = spriteLayers(level);
  const png = spriteBodyPng(asset);
  const names = [asset.defaultPalette, ...Object.keys(asset.palettes).filter((name) => name !== asset.defaultPalette)];
  return {
    png,
    recipe: {
      format: SPRITE_RECIPE_FORMAT,
      version: SPRITE_RECIPE_VERSION,
      crop: { x: 0, y: 0, width: body.width, height: body.height },
      widthMeters: body.width / SPRITE_SOURCE_TEXELS_PER_METER,
      anchor: { x: body.anchorX, y: body.anchorY },
      mask: [],
      palettes: Object.fromEntries(names.map((name) => [name, asset.palettes[name]!.colors])),
      ...(shadow ? { shadow: 'board' as const } : {}),
      ...(mirror ? { mirror: true as const } : {}),
      basedOn: [
        {
          image: original,
          bodySha256: await contentDigest(png),
          transform: { scale: 1, x: 0, y: 0 },
        },
      ],
    },
  };
}

/**
 * K's PNG made a product picture's source, registered (`registerSpriteSource`) to its picture 3, `frame`: the original
 * body (or a baked picture's pieces' bodies) as `recipe` places it in the master's texels, with the master's base point. The recipe keeps its shadow, dither
 * and mirror and takes:
 *
 * - the crop of the frame's extent in the PNG (whole pixels about the registration, its height fitting the frame's),
 *   the PNG padded with transparency where the crop reaches past it;
 * - the frame's width (`widthMeters`) and base point;
 * - `palettes: null`, to be chosen once by the caller;
 * - each piece's `transform` composed through the old recipe, from the PNG's pixels to its original's body.
 *
 * Then it is kept at its saved size (`reduceSpriteSource`). The registration's outline IoU and edges come with it.
 */
export function registeredProductSource(
  png: SourceImage,
  recipe: SpriteRecipe,
  frame: {
    readonly width: number;
    readonly height: number;
    readonly anchorX: number;
    readonly anchorY: number;
    readonly indices: readonly number[];
  },
) {
  if (!recipe.basedOn) throw new RangeError('Only a product picture is registered to its originals');
  const registration = registerSpriteSource(png, frame);
  const t = registration.transform;
  // The frame's edges in the PNG's pixels, and a crop of whole pixels about them.
  const left = Math.round(-t.x / t.scale),
    top = Math.round(-t.y / t.scale);
  const width = Math.max(1, Math.round(frame.width / t.scale));
  let height = Math.max(1, Math.round(frame.height / t.scale));
  while (height > 1 && Math.ceil((height * frame.width) / width) > frame.height) height--;
  while (Math.ceil((height * frame.width) / width) < frame.height) height++;
  const pad = {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, left + width - png.width),
    bottom: Math.max(0, top + height - png.height),
  };
  const padded = padImage(png, pad);
  const crop = { x: left + pad.left, y: top + pad.top, width, height };
  const texel = width / frame.width;
  // A PNG pixel p lies at the master's t.scale·p + t, which the old recipe maps on to the original body.
  const oldTexel = recipe.crop.width / frame.width;
  const fine = (value: number) => Math.round(value * 1e9) / 1e9;
  const { dither, shadow, mirror, bakedSha256 } = recipe;
  const registered: SpriteRecipe = {
    format: SPRITE_RECIPE_FORMAT,
    version: SPRITE_RECIPE_VERSION,
    crop,
    widthMeters: frame.width / SPRITE_SOURCE_TEXELS_PER_METER,
    anchor: {
      x: fine(crop.x + (frame.anchorX + 0.5) * texel - 0.5),
      y: fine(crop.y + (frame.anchorY + 0.5) * texel - 0.5),
    },
    mask: [],
    palettes: null,
    ...(dither ? { dither } : {}),
    ...(shadow ? { shadow } : {}),
    ...(mirror ? { mirror } : {}),
    ...(bakedSha256 ? { bakedSha256 } : {}),
    // A padded PNG pixel p is the old source's pixel crop + oldTexel · (t.scale · (p − pad) + t).
    basedOn: recipe.basedOn.map((piece) => ({
      ...piece,
      transform: composePieceTransform(piece.transform, {
        scale: oldTexel * t.scale,
        x: recipe.crop.x + oldTexel * (t.x - t.scale * pad.left),
        y: recipe.crop.y + oldTexel * (t.y - t.scale * pad.top),
      }),
    })),
  };
  // Anchors to a billionth of a pixel again after the reduction, kept where the master's base point stays within its
  // frame (a base point on an edge stays on it).
  const reduced = reduceSpriteSource(padded, registered);
  const { crop: savedCrop, anchor } = reduced.recipe;
  const toMaster = frame.width / savedCrop.width;
  const within = (value: number, start: number, size: number) => {
    let kept = fine(value);
    while ((kept + 0.5 - start) * toMaster - 0.5 > size - 0.5) kept -= 1e-9;
    while ((kept + 0.5 - start) * toMaster - 0.5 < -0.5) kept += 1e-9;
    return kept;
  };
  return {
    image: reduced.image,
    recipe: {
      ...reduced.recipe,
      anchor: {
        x: within(anchor.x, savedCrop.x, frame.width),
        ...(anchor.y === undefined ? {} : { y: within(anchor.y, savedCrop.y, frame.height) }),
      },
    },
    iou: registration.iou,
    edges: registration.edges,
  };
}

/** An image with transparent pixels added on each side. */
function padImage(
  image: SourceImage,
  pad: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): SourceImage {
  const width = image.width + pad.left + pad.right,
    height = image.height + pad.top + pad.bottom;
  const pixels = new Uint32Array(width * height);
  for (let y = 0; y < image.height; y++)
    pixels.set(image.pixels.subarray(y * image.width, (y + 1) * image.width), (y + pad.top) * width + pad.left);
  return { width, height, pixels };
}
