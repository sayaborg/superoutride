import type { ContentDelivery } from './content-delivery.js';
import { readCourseDocumentBytes } from '../course/course-document.js';
import { compileCourseDocument } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';
import { missingContent, requireLoaded } from './content-load-error.js';

/** Resolve a saved course and the delivered images whose digests it declares through the admitted delivery index. */
export async function loadDeliveredCourse(content: ContentDelivery, id: string, materials: SurfaceMaterialCatalog) {
  const file = content.manifest.files.find((entry) => entry.kind === 'course' && entry.id === id);
  if (!file) throw missingContent('course', id);
  const source = requireLoaded(readCourseDocumentBytes(await content.bytes('course', id), file.path));
  // A course names its images by the saved bytes' SHA-256; the manifest entry with that digest delivers them.
  // An undelivered digest supplies no bytes, and course admission reports it missing.
  const digests = new Set(source.assets.map((asset) => asset.sha256));
  const entries = content.manifest.files.filter((entry) => entry.kind === 'image' && digests.has(entry.sha256));
  const images = await Promise.all(
    [...new Map(entries.map((entry) => [entry.sha256, entry])).values()].map(async (entry) => ({
      sha256: entry.sha256,
      bytes: await content.bytes('image', entry.id),
    })),
  );
  return requireLoaded(await compileCourseDocument(source, id, file.sha256, images, materials, file.path));
}
