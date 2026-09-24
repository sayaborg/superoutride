import { contentDigest } from '../../core/content-digest.js';
import { CourseAssetError, courseFailures, courseSuccess, type CourseResult } from '../course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CourseAssetReference } from '../course-document.js';
import { TileBackgroundImage, type TileBackgroundDocument } from '../../image/tile-background-image.js';
import { readSpriteLodAsset, spriteLodLayout, type SpriteLodDocument } from '../../image/sprite.js';

/** Offline source admission bounds, not resident image/device budgets or art-quality settings. */
export const COURSE_IMAGE_SOURCE_RECIPE = Object.freeze({
  id: 'superoutride.course-image-source',
  version: 2,
});

export interface CourseAssetBytes {
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

/** Canonical descriptor and owned indexed source. No mutable decoded buffer enters the graph. */
export interface CompiledCourseImageSource extends CourseAssetReference {
  readonly source: SpriteLodDocument | TileBackgroundDocument;
}

/** References have passed document admission; all caller bytes are owned before the first await. */
export async function compileCourseImageSources(
  references: readonly CourseAssetReference[],
  inputs: readonly CourseAssetBytes[],
): Promise<CourseResult<readonly CompiledCourseImageSource[]>> {
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
  ) => errors.push(new CourseAssetError(code, sha256, required.get(sha256) ?? [], message, inputIndex));
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
  const sources = new Map<string, SpriteLodDocument | TileBackgroundDocument>();
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
        new TileBackgroundImage(value);
        levelTexels += background.patterns.length * 256;
      } else readSpriteLodAsset(value);
    } catch (cause) {
      if (!(cause instanceof RangeError)) throw cause;
      error('asset_invalid_image', sha256, cause.message, inputIndex);
      continue;
    }
    const source = value as SpriteLodDocument | TileBackgroundDocument;
    freezeSource(source);
    sources.set(sha256, source);
  }
  if (errors.length) return courseFailures(errors);
  return courseSuccess(
    Object.freeze(
      references.map((reference) => Object.freeze({ ...reference, source: sources.get(reference.sha256)! })),
    ),
  );
}

/** JSON ownership is established at admission, including nested mixture pairs and tile bindings. */
function freezeSource(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeSource(child);
  Object.freeze(value);
}
