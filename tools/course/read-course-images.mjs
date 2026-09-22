import { createReadStream } from 'node:fs';
import path from 'node:path';
import { COURSE_IMAGE_SOURCE_RECIPE } from '../../dist/course/compiler/course-image-source.js';
import { CourseAssetError } from '../../dist/course/course-diagnostics.js';

/** Bounded I/O over admitted digest filenames; the compiler checks exact bytes and image semantics. */
export async function readCourseImages(references, directory) {
  const inputs = [],
    seen = new Set();
  let total = 0;
  for (const reference of references) {
    if (seen.has(reference.sha256)) continue;
    seen.add(reference.sha256);
    const chunks = [];
    let size = 0;
    for await (const chunk of createReadStream(path.join(directory, `${reference.sha256}.json`))) {
      size += chunk.length;
      total += chunk.length;
      if (size > COURSE_IMAGE_SOURCE_RECIPE.maxEncodedBytes || total > COURSE_IMAGE_SOURCE_RECIPE.maxTotalEncodedBytes)
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
