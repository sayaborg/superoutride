import type { ContentDelivery } from './content-delivery.js';
import { courseImageNames, readCourseDocumentBytes } from '../course/course-document.js';
import { compileCourseDocument, type CourseCompileWork } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';
import type { CurvatureBounds } from '../course/geometry/profile-bound.js';
import { withCrestTrial } from './crest-trials.js';
import { missingContent, requireLoaded } from './content-load-error.js';

/**
 * Resolve a saved course and the delivered images it names through the admitted delivery index. `loaded` hears each
 * fetched file: how many of the course's files have arrived and how many there are, once the course names them. The
 * compilation runs as `work` says, its profiles laid within `bounds` where given (the crests and dips rule). With
 * `crestKmh`, a course delivered with crest trials takes their Sections' profiles at that speed (`withCrestTrial`), its
 * identity unchanged; one without them is as saved.
 */
export async function loadDeliveredCourse(
  content: ContentDelivery,
  id: string,
  materials: SurfaceMaterialCatalog,
  loaded?: (files: number, total: number) => void,
  work?: CourseCompileWork,
  bounds: CurvatureBounds | null = null,
  crestKmh: number | null = null,
) {
  const file = content.manifest.files.find((entry) => entry.kind === 'course' && entry.id === id);
  if (!file) throw missingContent('course', id);
  const trial = crestKmh === null ? null : content.manifest.files.find((e) => e.kind === 'crest-trial' && e.id === id);
  let bytes = await content.bytes('course', id);
  if (trial) {
    const json = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)) as unknown;
    const course = json(bytes) as Parameters<typeof withCrestTrial>[0];
    const laid = withCrestTrial(course, json(await content.bytes('crest-trial', id)), crestKmh!);
    bytes = new TextEncoder().encode(JSON.stringify(laid));
  }
  const source = requireLoaded(readCourseDocumentBytes(bytes, file.path));
  // A course names its images; the manifest's image entry of that name delivers them, checked against its digest.
  // An undelivered name supplies no bytes, and course admission reports it missing.
  const names = new Set(courseImageNames(source));
  const entries = content.manifest.files.filter((entry) => entry.kind === 'image' && names.has(entry.id));
  let files = 1;
  loaded?.(files, 1 + entries.length);
  const images = await Promise.all(
    entries.map(async (entry) => {
      const bytes = await content.bytes('image', entry.id);
      loaded?.(++files, 1 + entries.length);
      return { name: entry.id, bytes };
    }),
  );
  return requireLoaded(
    await compileCourseDocument(source, id, file.sha256, images, materials, file.path, work, bounds),
  );
}
