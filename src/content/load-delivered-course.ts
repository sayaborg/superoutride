import type { ContentDelivery } from './content-delivery.js';
import { courseImageNames, readCourseDocumentBytes } from '../course/course-document.js';
import { compileCourseDocument } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';
import { missingContent, requireLoaded } from './content-load-error.js';

/** Resolve a saved course and the delivered images it names through the admitted delivery index. */
export async function loadDeliveredCourse(content: ContentDelivery, id: string, materials: SurfaceMaterialCatalog) {
  const file = content.manifest.files.find((entry) => entry.kind === 'course' && entry.id === id);
  if (!file) throw missingContent('course', id);
  const source = requireLoaded(readCourseDocumentBytes(await content.bytes('course', id), file.path));
  // A course names its images; the manifest's image entry of that name delivers them, checked against its digest.
  // An undelivered name supplies no bytes, and course admission reports it missing.
  const names = new Set(courseImageNames(source));
  const entries = content.manifest.files.filter((entry) => entry.kind === 'image' && names.has(entry.id));
  const images = await Promise.all(
    entries.map(async (entry) => ({ name: entry.id, bytes: await content.bytes('image', entry.id) })),
  );
  return requireLoaded(await compileCourseDocument(source, id, file.sha256, images, materials, file.path));
}
