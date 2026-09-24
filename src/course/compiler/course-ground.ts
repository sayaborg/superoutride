import type { CompiledCourse } from './compiled-course.js';
import type { CompiledSection } from './course-graph.js';
/** Share compiled Section fields and aggregate course observations before driving. */
export function createCourseGround(course: CompiledCourse) {
  const table = new Map(
    course.sections.map((section) => {
      const ground = section.color;
      return [section, ground] as const;
    }),
  );
  const products = [...table.values()];
  const sum = (key: 'expandedStrips' | 'preblendCells' | 'lateralFields' | 'coefficientBytes' | 'directoryBytes') =>
    products.reduce((n, p) => n + p.metrics[key], 0);
  return Object.freeze({
    kind: 'strips' as const,
    metrics: Object.freeze({
      kind: 'strips' as const,
      sectionCount: products.length,
      expandedStrips: sum('expandedStrips'),
      maxActiveStrips: Math.max(...products.map((p) => p.metrics.maxActiveStrips)),
      preblendCells: sum('preblendCells'),
      lateralFields: sum('lateralFields'),
      coefficientBytes: sum('coefficientBytes'),
      directoryBytes: sum('directoryBytes'),
    }),
    forSection(section: CompiledSection) {
      return table.get(section)!;
    },
  });
}
export type CourseGround = ReturnType<typeof createCourseGround>;
