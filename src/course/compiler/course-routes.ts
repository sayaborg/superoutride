import type { CompiledLink, CompiledSection } from './course-graph.js';

/**
 * A course's one route from its entry: its Links in order to the terminal Section, each Section's one outgoing Link
 * (K, 2026-11-12: courses do not branch); a circuit's is empty, its laps repeating the cycle.
 */
export function courseRouteLinks(entry: CompiledSection, type: 'CIRCUIT' | 'LINEAR'): readonly CompiledLink[] {
  const links: CompiledLink[] = [];
  if (type === 'LINEAR') for (let link = entry.outgoing[0]; link; link = link.to.section.outgoing[0]) links.push(link);
  return Object.freeze(links);
}
