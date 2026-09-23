import type { CourseDocument } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';

export function compileCourseImages(
  document: CourseDocument,
  inputs: readonly CourseAssetBytes[],
): Promise<{ document: CourseDocument; images: CourseAssetBytes[] }>;
