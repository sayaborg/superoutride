import { AdmissionError, deepFreeze } from '../../core/admission.js';
import { contentDigest } from '../../core/content-digest.js';
import { CourseAssetError, courseFailures, courseSuccess, type CourseResult } from '../course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CourseAssetReference } from '../course-document.js';
import {
  compileTileBackground,
  type TileBackgroundDocument,
  type TileBackgroundImage,
} from '../../image/tile-background-image.js';
import { readSpriteLodAsset, spriteLodLayout, type SpriteAsset, type SpriteLodDocument } from '../../image/sprite.js';

/** Offline source admission bounds, not resident image/device budgets or art-quality settings. */
export const COURSE_IMAGE_SOURCE_RECIPE = Object.freeze({
  id: 'superoutride.course-image-source',
  version: 2,
});

export interface CourseAssetBytes {
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

type AdmittedImage =
  | { readonly kind: 'sprite'; readonly image: SpriteAsset; readonly document: SpriteLodDocument }
  | { readonly kind: 'background'; readonly image: TileBackgroundImage; readonly document: TileBackgroundDocument };

/** Canonical descriptor and the immutable reader decoded once at admission; consumers borrow it. */
export type CompiledCourseImageSource = CourseAssetReference &
  (
    | { readonly kind: 'sprite'; readonly image: SpriteAsset }
    | { readonly kind: 'background'; readonly image: TileBackgroundImage }
  );

/** An admitted image with the frozen saved document it was decoded from, for build-time compilers. */
export type AdmittedCourseImage = CourseAssetReference & AdmittedImage;

/** Compile the course's image references into their decoded readers. */
export async function compileCourseImageSources(
  references: readonly CourseAssetReference[],
  inputs: readonly CourseAssetBytes[],
): Promise<CourseResult<readonly CompiledCourseImageSource[]>> {
  const admitted = await readCourseImageSources(references, inputs);
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
 * Admit saved image bytes: each unique digest is decoded once. References have passed document
 * admission; all caller bytes are owned before the first await.
 */
export async function readCourseImageSources(
  references: readonly CourseAssetReference[],
  inputs: readonly CourseAssetBytes[],
): Promise<CourseResult<readonly AdmittedCourseImage[]>> {
  if (!Array.isArray(inputs)) throw new TypeError('Image inputs must be an array');
  const required = new Map<string, number[]>();
  references.forEach((reference, index) => {
    const indices = required.get(reference.sha256);
    if (indices) indices.push(index);
    else required.set(reference.sha256, [index]);
  });
  const errors: CourseAssetError[] = [];
  const error = (
    code: ConstructorParameters<typeof CourseAssetError>[0],
    sha256: string,
    message: string,
    inputIndex?: number,
    path?: string,
  ) => errors.push(new CourseAssetError(code, sha256, required.get(sha256) ?? [], message, inputIndex, path));
  const supplied = new Map<string, { inputIndex: number; bytes: Uint8Array<ArrayBuffer> }>();
  let encodedBytes = 0;
  // Do not copy or hash an over-budget input set. Wrong API types remain programming errors.
  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input.sha256 !== 'string' || !(input.bytes instanceof Uint8Array))
      throw new TypeError('Each image input requires a digest and Uint8Array bytes');
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new RangeError('Image digest must be lowercase SHA-256');
    if (!(input.bytes.buffer instanceof ArrayBuffer)) throw new TypeError('Image input must not use shared memory');
    encodedBytes += input.bytes.byteLength;
    if (
      index >= COURSE_DOCUMENT_LIMITS.assets ||
      input.bytes.byteLength > COURSE_DOCUMENT_LIMITS.imageEncodedBytes ||
      encodedBytes > COURSE_DOCUMENT_LIMITS.imageTotalEncodedBytes
    )
      error('resource_limit', input.sha256, 'Encoded image input exceeds source admission limits', index);
    if (index >= COURSE_DOCUMENT_LIMITS.assets) break;
    if (supplied.has(input.sha256)) error('asset_duplicate', input.sha256, 'Supply each saved digest once', index);
    else supplied.set(input.sha256, { inputIndex: index, bytes: input.bytes as Uint8Array<ArrayBuffer> });
    if (!required.has(input.sha256))
      error('asset_unreferenced', input.sha256, 'Image is not declared by this document', index);
  }
  for (const sha256 of required.keys())
    if (!supplied.has(sha256)) error('asset_missing', sha256, 'Saved image bytes are required');
  if (errors.length) return courseFailures(errors);
  // Iterate by document order, independent of input delivery order, including resource accounting.
  const owned = [...required.keys()].map((sha256) => {
    const input = supplied.get(sha256)!;
    return { sha256, inputIndex: input.inputIndex, bytes: new Uint8Array(input.bytes) };
  });
  const images = new Map<string, AdmittedImage>();
  let levelTexels = 0;
  for (const { sha256, inputIndex, bytes } of owned) {
    if ((await contentDigest(bytes)) !== sha256) {
      error('asset_digest_mismatch', sha256, 'Saved image bytes do not match the declared digest', inputIndex);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (cause) {
      if (!(cause instanceof SyntaxError || cause instanceof TypeError)) throw cause;
      error('asset_parse_failure', sha256, 'Saved image must be UTF-8 JSON', inputIndex);
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
        error('resource_limit', sha256, 'Image master exceeds source texel admission', inputIndex);
        continue;
      }
      if (Array.isArray(candidate.levels)) {
        const layout = spriteLodLayout(candidate.width, candidate.height).slice(0, candidate.levels.length);
        const count = layout.reduce((sum, level) => sum + level.width * level.height, 0);
        if (levelTexels + count > COURSE_DOCUMENT_LIMITS.imageTotalLevelTexels) {
          error('resource_limit', sha256, 'Unique saved images exceed total level texel admission', inputIndex);
          continue;
        }
        levelTexels += count;
      }
    }
    let admitted: AdmittedImage;
    try {
      if ((value as { format?: string } | null)?.format === 'superoutride.tile-background') {
        const background = value as TileBackgroundDocument;
        if (
          Array.isArray(background.patterns) &&
          background.patterns.length * 256 + levelTexels > COURSE_DOCUMENT_LIMITS.imageTotalLevelTexels
        ) {
          error('resource_limit', sha256, 'Background patterns exceed source texel admission', inputIndex);
          continue;
        }
        const image = compileTileBackground(value);
        levelTexels += background.patterns.length * 256;
        admitted = { kind: 'background', image, document: background };
      } else {
        // Sprite-LOD admission establishes the saved document's shape.
        admitted = { kind: 'sprite', image: readSpriteLodAsset(value), document: value as SpriteLodDocument };
      }
    } catch (cause) {
      if (!(cause instanceof AdmissionError)) throw cause;
      error('asset_invalid_image', sha256, cause.message, inputIndex, cause.path);
      continue;
    }
    // JSON ownership is established at admission, including nested mixture pairs and tile bindings.
    deepFreeze(admitted.document);
    images.set(sha256, Object.freeze(admitted));
  }
  if (errors.length) return courseFailures(errors);
  return courseSuccess(
    Object.freeze(references.map((reference) => Object.freeze({ ...reference, ...images.get(reference.sha256)! }))),
  );
}
