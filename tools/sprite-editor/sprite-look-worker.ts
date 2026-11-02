import { paintSlots, slotWords } from './slot-pixels.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { readSpriteLodAsset, type SpriteLodAsset } from '../../src/image/sprite.js';
import { spriteBodyPng } from '../graphics/sprite-body-png.js';
import { productOutlineIoU } from '../graphics/sprite-basis.js';
import { readSpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { THUMBNAIL } from './sprite-picture-looks.js';
import { comparisonPictures, type ComparisonPicturesRequest } from './sprite-comparison-pictures.js';
import { assetBytes } from './sprite-import-bytes.js';
import { readCourseForEditor, type CourseReadingRequest } from './sprite-course-reading.js';
import { courseWidthsOf, editCourse, type CourseEditRequest, type CourseWidthsRequest } from './sprite-course-edits.js';

/**
 * What the list shows of one picture, worked out off the page's thread from its files' bytes: its saved image (`image`,
 * null when it is not there), whose master holds its shadow's texels when it is an original (`shadowInMaster`); for a
 * product picture its recipe and its pieces' original images, in the recipe's order.
 */
export interface PictureLookRequest {
  readonly id: number;
  readonly image: Uint8Array<ArrayBuffer> | null;
  readonly shadowInMaster: boolean;
  readonly recipe: Uint8Array<ArrayBuffer> | null;
  readonly originals: readonly Uint8Array<ArrayBuffer>[];
}

/**
 * A product picture's outline IoU against what it is based on (`productOutlineIoU`; null for an original, or when it
 * could not be worked out), its originals' body digests (`spriteBodyPng`'s SHA-256, which `STALE` compares with its
 * pieces'; null when they could not be), and the thumbnail. Each part is worked out apart, so one that fails leaves
 * the other; `failure` says why a part was not worked out, null when none failed.
 */
export interface PictureLook {
  readonly iou: number | null;
  readonly bodies: readonly string[] | null;
  readonly thumbnail: ImageBitmap | null;
  readonly failure: string | null;
}

/** A saved image read off the page's thread: its master (level 0) handed over as bytes, and its body's digest. */
export interface PictureReadRequest {
  readonly id: number;
  readonly kind: 'picture';
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const json = (bytes: Uint8Array<ArrayBuffer>) => JSON.parse(new TextDecoder().decode(bytes)) as unknown;

/** The saved image's level 0 as the game colors it, its shadow dimmed, fitted into a THUMBNAIL square. */
function thumbnail(level: ReturnType<typeof readSpriteLodAsset>['levels'][number], shadowInMaster: boolean) {
  const { body, shadow } = spriteLayers(level, false, shadowInMaster);
  const image = new ImageData(body.width, body.height);
  paintSlots(image, body, slotWords(level.paletteRgb555));
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

self.addEventListener(
  'message',
  async ({
    data,
  }: MessageEvent<
    | PictureLookRequest
    | ComparisonPicturesRequest
    | CourseReadingRequest
    | CourseEditRequest
    | CourseWidthsRequest
    | PictureReadRequest
  >) => {
    if ('kind' in data) {
      try {
        if (data.kind === 'picture') {
          const asset = readSpriteLodAsset(json(data.bytes));
          const bodySha256 = await contentDigest(spriteBodyPng(asset));
          const read = assetBytes(asset, 1);
          self.postMessage({ id: data.id, asset: read.asset, bodySha256 }, { transfer: read.transfer });
          return;
        }
        if (data.kind === 'course') {
          self.postMessage({ id: data.id, reading: readCourseForEditor(data) });
          return;
        }
        if (data.kind === 'edit') {
          self.postMessage({ id: data.id, edited: editCourse(data) });
          return;
        }
        if (data.kind === 'widths of') {
          self.postMessage({ id: data.id, counts: courseWidthsOf(data) });
          return;
        }
        const { pictures, transfer } = comparisonPictures(data);
        self.postMessage({ id: data.id, pictures }, { transfer });
      } catch (error) {
        self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    const failures: string[] = [];
    const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
    let originals: SpriteLodAsset[] | null = null,
      bodies: string[] | null = null,
      iou: number | null = null,
      bitmap: ImageBitmap | null = null;
    try {
      originals = data.originals.map((bytes) => readSpriteLodAsset(json(bytes)));
      bodies = await Promise.all(originals.map((original) => contentDigest(spriteBodyPng(original))));
    } catch (error) {
      failures.push(`its originals' bodies: ${reason(error)}`);
    }
    if (!data.image) failures.push('its image is not there');
    else
      try {
        const level = readSpriteLodAsset(json(data.image)).levels[0]!;
        if (data.recipe) {
          if (!originals) throw new RangeError('its originals do not read');
          iou = productOutlineIoU(readSpriteRecipe(json(data.recipe)), level, originals);
        }
        bitmap = thumbnail(level, data.shadowInMaster);
      } catch (error) {
        failures.push(`its outline and thumbnail: ${reason(error)}`);
      }
    const look: PictureLook = { iou, bodies, thumbnail: bitmap, failure: failures.join('; ') || null };
    self.postMessage({ id: data.id, ...look }, { transfer: bitmap ? [bitmap] : [] });
  },
);
