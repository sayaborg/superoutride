import { Profile, ProfilePolyline } from '../geometry/profile.js';
import type { SectionDocument, CoursePosition } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { requireCourse } from '../course-diagnostics.js';

export const COURSE_PHYSICAL_RECIPE = Object.freeze({
  id: 'superoutride.course-physical',
  version: 5,
});

/** Static compilation resolves authored physics once; no default height or implicit height. */
export function compileCoursePhysicalContent(
  source: SectionDocument,
  length: number,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
) {
  const heightPath = `${path}/height`;
  const nodes = source.height.map((node, i) => ({
    s: resolve(node.at, `${heightPath}/${i}/at`).s,
    y: node.y,
    curveLength: node.curveLength,
  }));
  requireCourse(nodes.length >= 2, heightPath, 'Height requires at least two nodes', 'invalid_height');
  requireCourse(
    nodes[0]!.s === 0 && nodes.at(-1)!.s === length,
    heightPath,
    'Height must cover [0, Section length]',
    'invalid_height',
  );
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    requireCourse(
      b.s > a.s && Number.isFinite((b.y - a.y) / (b.s - a.s)),
      `${heightPath}/${i}`,
      'Height nodes must increase with finite grade',
      'invalid_height',
    );
  }
  for (let i = 0; i < nodes.length; i++) {
    if (i === 0 || i === nodes.length - 1)
      requireCourse(
        nodes[i]!.curveLength === 0,
        `${heightPath}/${i}/curveLength`,
        'Endpoint curve length must be zero',
        'invalid_height',
      );
    if (i > 0)
      requireCourse(
        nodes[i - 1]!.s + nodes[i - 1]!.curveLength / 2 <= nodes[i]!.s - nodes[i]!.curveLength / 2,
        `${heightPath}/${i}/curveLength`,
        'Adjacent vertical curves must not overlap',
        'invalid_height',
      );
  }
  const height = Object.freeze(new Profile(length, nodes));
  const renderHeight = Object.freeze(new ProfilePolyline(height));
  return Object.freeze({ height, renderHeight });
}
