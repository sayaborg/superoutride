import type { CourseDocument } from '../../src/course/course-document.js';
import { courseImageNames } from '../../src/course/course-document.js';
import type { CourseImageBytes } from '../../src/course/compiler/course-image-source.js';
import { readCourseImageSources } from '../../src/course/compiler/course-image-source.js';
import { CourseAssetError, courseFailures } from '../../src/course/course-diagnostics.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';
import { spriteLodLayout } from '../../src/image/sprite.js';
import { requireLoaded } from '../../src/content/content-load-error.js';

/** Delivered image IDs that are not course images: a course cannot name an image so. */
export const RESERVED_IMAGE_NAMES: readonly string[] = ['vehicles', 'text-tiles'];

/**
 * Build-only image delivery: the delivered bytes of each image a course names, by that name, each its saved document as
 * compact JSON. A sprite, a placement's or a movable body's knocked image alike, is saved with every level of its LOD
 * (`courseImageFile`), so the build admits it as it is and compiles no level; a background has no LOD.
 * The course document itself is unchanged.
 */
export async function compileCourseImages(document: CourseDocument, inputs: readonly CourseImageBytes[]) {
  const names = courseImageNames(document);
  const reserved = names.filter((name) => RESERVED_IMAGE_NAMES.includes(name));
  if (reserved.length)
    requireLoaded(
      courseFailures(
        reserved.map((name) => new CourseAssetError('asset_invalid_image', name, 'This image name is reserved')),
      ),
    );
  const admitted = requireLoaded(await readCourseImageSources(names, inputs));
  const partial = admitted.filter(
    (image) =>
      image.kind === 'sprite' &&
      image.image.levels.length !== spriteLodLayout(image.image.width, image.image.height).length,
  );
  if (partial.length)
    requireLoaded(
      courseFailures(
        partial.map(
          (image) =>
            new CourseAssetError('asset_invalid_image', image.id, 'A saved sprite holds every level of its LOD'),
        ),
      ),
    );
  const images: CourseImageBytes[] = admitted.map((image) => ({
    name: image.id,
    bytes: encodeContentJson(image.document),
  }));
  return { document, images };
}
