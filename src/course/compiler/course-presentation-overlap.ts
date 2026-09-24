import { courseSuccess } from '../course-diagnostics.js';
import type { CompiledLink } from './course-graph.js';
import { compileCourseConsumerDemand } from './course-consumer-demand.js';

const consumers = ['cameraRender', 'groundFilter', 'scenery'] as const;

/** Declared presentation query coverage only; removed together with consumer domains in 6-9c. */
export function compileCoursePresentationDomains(links: readonly CompiledLink[], input: unknown) {
  const demand = compileCourseConsumerDemand(input, consumers);
  if (!demand.ok) return demand;
  return courseSuccess(
    Object.freeze({
      scope: 'presentation-query-domain' as const,
      links: Object.freeze([...links]),
      demand: demand.value,
    }),
  );
}
