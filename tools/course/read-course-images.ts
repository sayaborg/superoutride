import type { CourseAssetReference } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { CourseAssetError } from '../../src/course/course-diagnostics.js';

/** Bounded I/O over admitted digest filenames; the compiler checks exact bytes and image semantics. */
export async function readCourseImages(
  references: readonly CourseAssetReference[],
  directory: string,
): Promise<CourseAssetBytes[]> {
  const inputs: CourseAssetBytes[] = [],
    seen = new Set<string>();
  let total = 0;
  for (const reference of references) {
    if (seen.has(reference.sha256)) continue;
    seen.add(reference.sha256);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of createReadStream(path.join(directory, `${reference.sha256}.json`))) {
      size += chunk.length;
      total += chunk.length;
      if (size > COURSE_DOCUMENT_LIMITS.imageEncodedBytes || total > COURSE_DOCUMENT_LIMITS.imageTotalEncodedBytes)
        throw new CourseAssetError(
          'resource_limit',
          reference.sha256,
          references.flatMap((value, index) => (value.sha256 === reference.sha256 ? [index] : [])),
          'Saved image files exceed source byte admission',
        );
      chunks.push(chunk);
    }
    inputs.push({ sha256: reference.sha256, bytes: Buffer.concat(chunks) });
  }
  return inputs;
}
