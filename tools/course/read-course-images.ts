import type { CourseAssetReference } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { CourseAssetError } from '../../src/course/course-diagnostics.js';

/**
 * Bounded reading of the saved images an admitted document names, each once, by its digest file name
 * (`<sha256>.json`); the compiler checks exact bytes and image semantics.
 */
export async function readCourseImages(
  references: readonly CourseAssetReference[],
  read: (file: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<CourseAssetBytes[]> {
  const inputs: CourseAssetBytes[] = [],
    seen = new Set<string>();
  let total = 0;
  for (const reference of references) {
    if (seen.has(reference.sha256)) continue;
    seen.add(reference.sha256);
    const bytes = await read(`${reference.sha256}.json`);
    total += bytes.byteLength;
    if (
      bytes.byteLength > COURSE_DOCUMENT_LIMITS.imageEncodedBytes ||
      total > COURSE_DOCUMENT_LIMITS.imageTotalEncodedBytes
    )
      throw new CourseAssetError(
        'resource_limit',
        reference.sha256,
        references.flatMap((value, index) => (value.sha256 === reference.sha256 ? [index] : [])),
        'Saved image files exceed source byte admission',
      );
    inputs.push({ sha256: reference.sha256, bytes });
  }
  return inputs;
}
