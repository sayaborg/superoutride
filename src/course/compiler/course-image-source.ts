import { AdmissionError, deepFreeze } from '../../core/admission.js';
import { contentDigest } from '../../core/content-digest.js';
import { UNSLICED, type WorkSlices } from '../../core/work-slices.js';
import { CourseAssetError, courseFailures, courseSuccess, type CourseResult } from '../course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import {
  compileTilePicture,
  TILE_PICTURE_FORMAT,
  type TilePictureDocument,
  type TilePicture,
} from '../../image/tile-picture.js';
import {
  readSpriteLodAsset,
  spriteLodLayout,
  type SpriteLodAsset,
  type SpriteLodDocument,
} from '../../image/sprite.js';

/** Offline source admission bounds, not resident image/device budgets or art-quality settings. */
export const COURSE_IMAGE_SOURCE_RECIPE = Object.freeze({
  id: 'superoutride.course-image-source',
  version: 3,
});

/** A course image's saved bytes, by the name the course document uses for it. */
export interface CourseImageBytes {
  readonly name: string;
  readonly bytes: Uint8Array;
}

type AdmittedImage =
  | { readonly kind: 'sprite'; readonly image: SpriteLodAsset; readonly document: SpriteLodDocument }
  | { readonly kind: 'background'; readonly image: TilePicture; readonly document: TilePictureDocument };

/**
 * An image as the course uses it: its name (`id`), the SHA-256 of its saved bytes, worked out from the bytes, and the
 * immutable reader decoded once at admission; consumers borrow it.
 */
export type CompiledCourseImageSource = { readonly id: string; readonly sha256: string } & (
  | { readonly kind: 'sprite'; readonly image: SpriteLodAsset }
  | { readonly kind: 'background'; readonly image: TilePicture }
);

/** An admitted image with the frozen saved document it was decoded from, which the build delivers as saved. */
export type AdmittedCourseImage = { readonly id: string; readonly sha256: string } & AdmittedImage;

/** Compile the images a course names into their decoded readers, pausing between images when `slices` is due. */
export async function compileCourseImageSources(
  names: readonly string[],
  inputs: readonly CourseImageBytes[],
  slices: WorkSlices = UNSLICED,
): Promise<CourseResult<readonly CompiledCourseImageSource[]>> {
  const admitted = await admitCourseImageSources(names, inputs, false, slices);
  if (!admitted.ok) return admitted;
  return courseSuccess(
    Object.freeze(
      admitted.value.map(({ id, sha256, ...image }) =>
        Object.freeze(
          image.kind === 'sprite'
            ? { id, sha256, kind: image.kind, image: image.image }
            : { id, sha256, kind: image.kind, image: image.image },
        ),
      ),
    ),
  );
}

/**
 * Admit the saved bytes of the images a course names, each name once and decoded once. The names have passed
 * document admission; all caller bytes are owned before the first await.
 */
export function readCourseImageSources(
  names: readonly string[],
  inputs: readonly CourseImageBytes[],
): Promise<CourseResult<readonly AdmittedCourseImage[]>> {
  return admitCourseImageSources(names, inputs, true, UNSLICED);
}

/**
 * The admission of `readCourseImageSources`. The saved documents are frozen and kept only when `documents` asks for
 * them; otherwise each parsed document is dropped once decoded, and nothing holds it.
 */
async function admitCourseImageSources(
  names: readonly string[],
  inputs: readonly CourseImageBytes[],
  documents: boolean,
  slices: WorkSlices,
): Promise<CourseResult<readonly AdmittedCourseImage[]>> {
  if (!Array.isArray(inputs)) throw new TypeError('Image inputs must be an array');
  const required = new Set(names);
  const errors: CourseAssetError[] = [];
  const error = (
    code: ConstructorParameters<typeof CourseAssetError>[0],
    name: string,
    message: string,
    inputIndex?: number,
    path?: string,
  ) => errors.push(new CourseAssetError(code, name, message, inputIndex, path));
  const supplied = new Map<string, { inputIndex: number; bytes: Uint8Array<ArrayBuffer> }>();
  let encodedBytes = 0;
  // Do not copy or hash an over-budget input set. Wrong API types remain programming errors.
  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input.name !== 'string' || !(input.bytes instanceof Uint8Array))
      throw new TypeError('Each image input requires a name and Uint8Array bytes');
    if (!(input.bytes.buffer instanceof ArrayBuffer)) throw new TypeError('Image input must not use shared memory');
    encodedBytes += input.bytes.byteLength;
    if (
      index >= COURSE_DOCUMENT_LIMITS.images ||
      input.bytes.byteLength > COURSE_DOCUMENT_LIMITS.imageEncodedBytes ||
      encodedBytes > COURSE_DOCUMENT_LIMITS.imageTotalEncodedBytes
    )
      error('resource_limit', input.name, 'Encoded image input exceeds source admission limits', index);
    if (index >= COURSE_DOCUMENT_LIMITS.images) break;
    if (supplied.has(input.name)) error('asset_duplicate', input.name, 'Supply each image once', index);
    else supplied.set(input.name, { inputIndex: index, bytes: input.bytes as Uint8Array<ArrayBuffer> });
    if (!required.has(input.name)) error('asset_unreferenced', input.name, 'The course does not use this image', index);
  }
  for (const name of required) if (!supplied.has(name)) error('asset_missing', name, 'Saved image bytes are required');
  if (errors.length) return courseFailures(errors);
  // Iterate by document order, independent of input delivery order, including resource accounting.
  const owned = [...required].map((name) => {
    const input = supplied.get(name)!;
    return { name, inputIndex: input.inputIndex, bytes: new Uint8Array(input.bytes) };
  });
  const images = new Map<string, AdmittedCourseImage>();
  let levelTexels = 0;
  for (const { name, inputIndex, bytes } of owned) {
    if (slices.due()) await slices.pause();
    const sha256 = await contentDigest(bytes);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (cause) {
      if (!(cause instanceof SyntaxError || cause instanceof TypeError)) throw cause;
      error('asset_parse_failure', name, 'Saved image must be UTF-8 JSON', inputIndex);
      continue;
    }
    // Bound the existing image reader's transient decoded allocation before format validation.
    const candidate = value as Partial<SpriteLodDocument> | null;
    if (
      candidate &&
      typeof candidate.width === 'number' &&
      typeof candidate.height === 'number' &&
      candidate.width > 0 &&
      candidate.height > 0 &&
      Number.isSafeInteger(candidate.width) &&
      Number.isSafeInteger(candidate.height)
    ) {
      if (candidate.width * candidate.height > COURSE_DOCUMENT_LIMITS.imageMasterTexels) {
        error('resource_limit', name, 'Image master exceeds source texel admission', inputIndex);
        continue;
      }
      if (Array.isArray(candidate.levels)) {
        const layout = spriteLodLayout(candidate.width, candidate.height).slice(0, candidate.levels.length);
        const count = layout.reduce((sum, level) => sum + level.width * level.height, 0);
        if (levelTexels + count > COURSE_DOCUMENT_LIMITS.imageTotalLevelTexels) {
          error('resource_limit', name, 'Unique saved images exceed total level texel admission', inputIndex);
          continue;
        }
        levelTexels += count;
      }
    }
    let admitted: AdmittedImage;
    try {
      if ((value as { format?: string } | null)?.format === TILE_PICTURE_FORMAT) {
        const background = value as TilePictureDocument;
        if (
          Array.isArray(background.patterns) &&
          background.patterns.length * 256 + levelTexels > COURSE_DOCUMENT_LIMITS.imageTotalLevelTexels
        ) {
          error('resource_limit', name, 'Background patterns exceed source texel admission', inputIndex);
          continue;
        }
        const image = compileTilePicture(value);
        levelTexels += background.patterns.length * 256;
        admitted = { kind: 'background', image, document: background };
      } else {
        // Sprite-LOD admission establishes the saved document's shape.
        admitted = { kind: 'sprite', image: readSpriteLodAsset(value), document: value as SpriteLodDocument };
      }
    } catch (cause) {
      if (!(cause instanceof AdmissionError)) throw cause;
      error('asset_invalid_image', name, cause.message, inputIndex, cause.path);
      continue;
    }
    // JSON ownership is established at admission, including nested mixture pairs and tile bindings.
    if (documents) deepFreeze(admitted.document);
    images.set(name, Object.freeze({ id: name, sha256, ...admitted }));
  }
  if (errors.length) return courseFailures(errors);
  return courseSuccess(Object.freeze([...required].map((name) => images.get(name)!)));
}
