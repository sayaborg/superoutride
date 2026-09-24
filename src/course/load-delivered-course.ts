import type { ContentDelivery } from '../core/content-manifest.js';
import { readCourseDocument } from './course-document.js';
import { compileCourseDocument } from './compiler/compiled-course.js';

/** Resolve a saved course and its unique image digests through the admitted delivery index. */
export async function loadDeliveredCourse(content: ContentDelivery, id: string) {
  const source = readCourseDocument(await content.json('course', id));
  if (!source.ok) throw new Error(JSON.stringify(source.diagnostics));
  const images = await Promise.all(
    [...new Set(source.value.assets.map((asset) => asset.sha256))].map(async (sha256) => ({
      sha256,
      bytes: await content.bytes('image', sha256),
    })),
  );
  const compiled = await compileCourseDocument(source.value, images);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.value;
}
