import type { CourseImageBytes } from '../../src/course/compiler/course-image-source.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { CourseAssetError } from '../../src/course/course-diagnostics.js';

/**
 * Bounded reading of the saved images an admitted document names, each once, by its file name (`<name>.json`); the
 * compiler checks image semantics.
 */
export async function readCourseImages(
  names: readonly string[],
  read: (file: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<CourseImageBytes[]> {
  const inputs: CourseImageBytes[] = [];
  let total = 0;
  for (const name of new Set(names)) {
    const bytes = await read(`${name}.json`);
    total += bytes.byteLength;
    if (
      bytes.byteLength > COURSE_DOCUMENT_LIMITS.imageEncodedBytes ||
      total > COURSE_DOCUMENT_LIMITS.imageTotalEncodedBytes
    )
      throw new CourseAssetError('resource_limit', name, 'Saved image files exceed source byte admission');
    inputs.push({ name, bytes });
  }
  return inputs;
}
