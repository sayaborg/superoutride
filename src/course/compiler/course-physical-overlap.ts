import { courseSuccess } from '../course-diagnostics.js';
import type { CompiledLink } from './course-graph.js';
import { compileCoursePhysicalDemand } from './course-physical-demand.js';

/** Declared physical query coverage only; removed together with consumer domains in 6-9c. */
export function compileCoursePhysicalDomains(links: readonly CompiledLink[], input: unknown) {
  const demand = compileCoursePhysicalDemand(input);
  if (!demand.ok) return demand;
  return courseSuccess(
    Object.freeze({
      scope: 'physical-query-domain' as const,
      links: Object.freeze([...links]),
      demand: demand.value,
    }),
  );
}
