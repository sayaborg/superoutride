import type { CourseDocument } from '../../src/course/course-document.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import type { CourseGround } from '../../src/course/compiler/course-ground.js';

export function loadCourse(
  file: string,
  imagesDirectory?: string,
): Promise<{ document: CourseDocument; course: CompiledCourse; images: CourseAssetBytes[] }>;
export function loadCourseGround(course: CompiledCourse, file?: string): Promise<CourseGround>;
