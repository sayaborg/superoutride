import type { ContentDelivery } from './content-manifest.js';
import { readCourseDocument } from '../course/course-document.js';
import { compileCourseDocument } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';

/** Resolve a saved course and the delivered images whose digests it declares through the admitted delivery index. */
export async function loadDeliveredCourse(content: ContentDelivery, id: string, materials: SurfaceMaterialCatalog) {
  const file = content.manifest.files.find((entry) => entry.kind === 'course' && entry.id === id);
  if (!file) throw new RangeError(`Content not listed in manifest: course ${id}`);
  const source = readCourseDocument(await content.json('course', id), file.path);
  if (!source.ok) throw new Error(JSON.stringify(source.diagnostics));
  // A course names its images by the saved bytes' SHA-256; the manifest entry with that digest delivers them.
  // An undelivered digest supplies no bytes, and course admission reports it missing.
  const digests = new Set(source.value.assets.map((asset) => asset.sha256));
  const entries = content.manifest.files.filter((entry) => entry.kind === 'image' && digests.has(entry.sha256));
  const images = await Promise.all(
    [...new Map(entries.map((entry) => [entry.sha256, entry])).values()].map(async (entry) => ({
      sha256: entry.sha256,
      bytes: await content.bytes('image', entry.id),
    })),
  );
  const compiled = await compileCourseDocument(source.value, images, materials, file.path);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.value;
}
