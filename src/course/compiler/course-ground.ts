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
  const sum = (key: 'expandedBands' | 'preblendCells' | 'lateralFields' | 'coefficientBytes' | 'directoryBytes') =>
    products.reduce((n, p) => n + p.metrics[key], 0);
  return Object.freeze({
    kind: 'bands' as const,
    metrics: Object.freeze({
      kind: 'bands' as const,
      sectionCount: products.length,
      expandedBands: sum('expandedBands'),
      maxActiveBands: Math.max(...products.map((p) => p.metrics.maxActiveBands)),
      preblendCells: sum('preblendCells'),
      lateralFields: sum('lateralFields'),
      coefficientBytes: sum('coefficientBytes'),
      directoryBytes: sum('directoryBytes'),
    }),
    forSection(section: CompiledSection) {
      const reader = table.get(section);
      if (!reader) throw new RangeError('Section is outside the compiled course');
      return reader;
    },
  });
}
export type CourseGround = ReturnType<typeof createCourseGround>;
