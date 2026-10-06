import type { CourseDocument } from '../../src/course/course-document.js';
import { courseImageNames } from '../../src/course/course-document.js';
import { expandCourseElements } from '../../src/course/course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { CourseImageBytes } from '../../src/course/compiler/course-image-source.js';
import { readCourseImageSources } from '../../src/course/compiler/course-image-source.js';
import { CourseAssetError, courseFailures } from '../../src/course/course-diagnostics.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { requireLoaded } from '../../src/content/content-load-error.js';

/** Delivered image IDs that are not course images: a course cannot name an image so. */
export const RESERVED_IMAGE_NAMES: readonly string[] = ['vehicles', 'text-tiles'];

/**
 * Build-only image compilation: the delivered bytes of each image a course names, by that name. A placement's sprite
 * master becomes its compiled LOD; every other image (backgrounds, knocked images) is delivered as its compact JSON.
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
  const placed = new Set<string>();
  for (const section of document.sections)
    expandCourseElements(
      section.sprites,
      '/sprites',
      COURSE_DOCUMENT_LIMITS.spritePlacements * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1),
      (sprite) => {
        placed.add(sprite.image);
      },
    );
  const admitted = requireLoaded(await readCourseImageSources(names, inputs));
  const images: CourseImageBytes[] = admitted.map((image) => ({
    name: image.id,
    bytes:
      image.kind === 'sprite' && placed.has(image.id)
        ? new TextEncoder().encode(JSON.stringify(compileSpriteLod(image.document, [[]], image.image)) + '\n')
        : encodeContentJson(image.document),
  }));
  return { document, images };
}
