import { compileCourseGround, readCourseGround } from '../../dist/compiler/course-ground.js';
import { loadCourseGround } from '../../tools/course/authoring-io.mjs';

const builds = new Map();
export async function testGround(course, mode) {
  if (mode) return loadCourseGround(course, `${mode}.course.json`);
  let product = builds.get(course.identity.buildSha256);
  if (!product) {
    product = compileCourseGround(course);
    builds.set(course.identity.buildSha256, product);
  }
  const { manifest, payload } = await product;
  return readCourseGround(course, manifest, payload);
}
