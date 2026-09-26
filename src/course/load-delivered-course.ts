import type { ContentDelivery } from '../core/content-manifest.js';
import { readCourseDocument } from './course-document.js';
import { compileCourseDocument } from './compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from './surface-material.js';

/** Resolve a saved course and its unique image digests through the admitted delivery index. */
export async function loadDeliveredCourse(content: ContentDelivery, id: string, materials: SurfaceMaterialCatalog) {
  const file = content.manifest.files.find((entry) => entry.kind === 'course' && entry.id === id);
  if (!file) throw new RangeError(`Content not listed in manifest: course ${id}`);
  const source = readCourseDocument(await content.json('course', id), file.path);
  if (!source.ok) throw new Error(JSON.stringify(source.diagnostics));
  const images = await Promise.all(
    [...new Set(source.value.assets.map((asset) => asset.sha256))].map(async (sha256) => ({
      sha256,
      bytes: await content.bytes('image', sha256),
    })),
  );
  const compiled = await compileCourseDocument(source.value, images, materials, file.path);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.value;
}
