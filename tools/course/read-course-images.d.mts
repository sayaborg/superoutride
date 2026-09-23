import type { CourseAssetReference } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';

export function readCourseImages(
  references: readonly CourseAssetReference[],
  directory: string,
): Promise<CourseAssetBytes[]>;
