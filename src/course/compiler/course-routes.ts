import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import type { CompiledLink, CompiledSection } from './course-graph.js';

/**
 * The one enumeration of a course graph's finite routes from its entry: each route is its Link list in canonical
 * outgoing order; a circuit has the single empty route. Enumeration stops after `COURSE_DOCUMENT_LIMITS.routes + 1`
 * routes so that compilation can reject a graph over the limit; an admitted course never reaches it.
 */
export function enumerateCourseRoutes(
  entry: CompiledSection,
  type: 'CIRCUIT' | 'BRANCH' | 'LINEAR',
): readonly (readonly CompiledLink[])[] {
  if (type === 'CIRCUIT') return Object.freeze([Object.freeze([])]);
  const routes: (readonly CompiledLink[])[] = [];
  const visit = (section: CompiledSection, links: readonly CompiledLink[]) => {
    if (routes.length > COURSE_DOCUMENT_LIMITS.routes) return;
    if (!section.outgoing.length) {
      routes.push(Object.freeze(links));
      return;
    }
    for (const link of section.outgoing) visit(link.to.section, [...links, link]);
  };
  visit(entry, []);
  return Object.freeze(routes);
}
