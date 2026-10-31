import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { productOutlineIoU } from '../graphics/sprite-basis.js';
import { readSpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { THUMBNAIL } from './sprite-picture-looks.js';

/**
 * What the list shows of one picture, worked out off the page's thread from its files' bytes: its saved image (`image`),
 * whose master holds its shadow's texels when it is an original (`shadowInMaster`); for a product picture its recipe
 * and its pieces' original images, in the recipe's order.
 */
export interface PictureLookRequest {
  readonly id: number;
  readonly image: Uint8Array<ArrayBuffer>;
  readonly shadowInMaster: boolean;
  readonly recipe: Uint8Array<ArrayBuffer> | null;
  readonly originals: readonly Uint8Array<ArrayBuffer>[];
}

/** A product picture's outline IoU against what it is based on (`productOutlineIoU`), and the thumbnail. */
export interface PictureLook {
  readonly iou: number | null;
  readonly thumbnail: ImageBitmap | null;
}

const json = (bytes: Uint8Array<ArrayBuffer>) => JSON.parse(new TextDecoder().decode(bytes)) as unknown;

/** The saved image's level 0 as the game colors it, its shadow dimmed, fitted into a THUMBNAIL square. */
function thumbnail(level: ReturnType<typeof readSpriteLodAsset>['levels'][number], shadowInMaster: boolean) {
  const { body, shadow } = spriteLayers(level, false, shadowInMaster);
  const image = new ImageData(body.width, body.height);
  body.indices.forEach((slot, i) => {
    if (!slot) return;
    const { r, g, b } = unpackRgba(rgb555ToRgba(level.paletteRgb555[slot]!));
    image.data.set([r, g, b, 255], i * 4);
  });
  if (shadow) {
    const dx = shadow.anchorX - body.anchorX,
      dy = shadow.anchorY - body.anchorY;
    for (let y = 0; y < body.height; y++)
      for (let x = 0; x < body.width; x++) {
        const sx = x + dx,
          sy = y + dy;
        if (sx >= 0 && sy >= 0 && sx < shadow.width && sy < shadow.height && shadow.indices[sy * shadow.width + sx])
          image.data.set([0, 0, 0, 96], (y * body.width + x) * 4);
      }
  }
  const scratch = new OffscreenCanvas(body.width, body.height);
  scratch.getContext('2d')!.putImageData(image, 0, 0);
  const canvas = new OffscreenCanvas(THUMBNAIL, THUMBNAIL);
  const graphics = canvas.getContext('2d')!;
  const scale = Math.min(1, THUMBNAIL / Math.max(body.width, body.height));
  graphics.imageSmoothingEnabled = scale < 1;
  const width = body.width * scale,
    height = body.height * scale;
  graphics.drawImage(scratch, (THUMBNAIL - width) / 2, THUMBNAIL - height, width, height);
  return canvas.transferToImageBitmap();
}

self.addEventListener('message', ({ data }: MessageEvent<PictureLookRequest>) => {
  try {
    const level = readSpriteLodAsset(json(data.image)).levels[0]!;
    const iou = data.recipe
      ? productOutlineIoU(
          readSpriteRecipe(json(data.recipe)),
          level,
          data.originals.map((bytes) => readSpriteLodAsset(json(bytes))),
        )
      : null;
    const bitmap = thumbnail(level, data.shadowInMaster);
    self.postMessage({ id: data.id, iou, thumbnail: bitmap }, { transfer: [bitmap] });
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
});
