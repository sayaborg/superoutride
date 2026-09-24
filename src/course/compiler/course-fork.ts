import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../image/sprite.js';
import { courseBoundaryAt, courseCarriagewayExists } from '../course-boundaries.js';
import { requireCourse } from '../course-diagnostics.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { stripSupportedIntervals, stripSupportsInterval } from '../strip-material.js';
import { stripEdgeAt, stripSlabAt } from '../strip-ground.js';
import type { CompiledFork, CompiledSection } from './course-graph.js';

/** Resolve parallel-zone geometry after canonical outgoing Links exist, before publication. */
export function compileCourseFork(
  section: CompiledSection,
  positions: { readonly lock: CompiledCoursePosition; readonly closure: CompiledCoursePosition } | null,
  path: string,
): CompiledFork | null {
  const conditional = section.presentation?.sprites.filter((p) => p.unselected !== null) ?? [];
  if (positions === null) {
    requireCourse(conditional.length === 0, path, 'State-selected road signs require a fork', 'invalid_fork');
    return null;
  }
  const { lock, closure } = positions;
  const check = (condition: boolean, message: string) => requireCourse(condition, path, message, 'invalid_fork');
  check(section.outgoing.length >= 2, 'A fork requires two or three canonical exits');
  check(
    lock.s > 0 && lock.s < closure.s && closure.s < section.coordinates.domain.end,
    'Fork positions require 0 < lock < closure < every exit seam',
  );
  for (const placement of conditional) {
    check(
      section.outgoing.some((link) => link.from.carriageway === placement.unselected),
      'Road sign state must name a canonical exit carriageway',
    );
    check(placement.at.s >= lock.s && placement.at.s <= closure.s, 'Road signs lie between lock and closure');
    check(
      placement.at.s + placement.instance.asset.source.width / SPRITE_SOURCE_TEXELS_PER_METER <
        section.coordinates.domain.end,
      'State-selected signs must precede the exit cut',
    );
  }
  const material = section.material;
  const supported = stripSupportedIntervals(material.slabs[stripSlabAt(material.slabs, lock.s)]!, lock.s);
  check(supported.length === 1, 'Supported lock space must be one continuous interval');
  const [outerLeft, outerRight] = supported[0]!;
  for (const slab of material.slabs) {
    if (slab.end <= lock.s || slab.start > closure.s) continue;
    const start = Math.max(lock.s, slab.start),
      end = Math.min(closure.s, slab.end);
    for (const span of slab.spans)
      for (const side of ['left', 'right'] as const)
        check(
          stripEdgeAt(span, side, start) === stripEdgeAt(span, side, end),
          'Lock-to-closure material cross sections must remain parallel',
        );
    for (const at of [start, end]) {
      const ranges = stripSupportedIntervals(slab, at);
      check(
        ranges.length === 1 && ranges[0]![0] === outerLeft && ranges[0]![1] === outerRight,
        'Parallel-zone roads and medians must remain supported with unchanged cross-section bounds',
      );
    }
  }
  const roads = section.outgoing
    .map((link) => {
      const road = link.from.carriageway;
      check(
        courseCarriagewayExists(road, lock.s, section.coordinates.domain.end) &&
          courseCarriagewayExists(road, closure.s, section.coordinates.domain.end),
        'Each exit carriageway must exist from lock through closure',
      );
      const left = courseBoundaryAt(road.left, lock.s),
        right = courseBoundaryAt(road.right, lock.s);
      check(
        stripSupportsInterval(material, lock.s, left, right),
        'Each exit carriageway must have positive supported width at lock',
      );
      for (const boundary of [road.left, road.right]) {
        const value = courseBoundaryAt(boundary, lock.s);
        check(
          courseBoundaryAt(boundary, closure.s) === value &&
            boundary.vertices.every((k) => k.at.s <= lock.s || k.at.s >= closure.s || k.l === value),
          'Lock-to-closure Carriageway edges must remain parallel',
        );
      }
      return { link, left, right };
    })
    .sort((a, b) => a.left - b.left);
  check(
    section.carriageways
      .filter(
        (road) =>
          courseCarriagewayExists(road, lock.s, section.coordinates.domain.end) &&
          courseBoundaryAt(road.right, lock.s) > courseBoundaryAt(road.left, lock.s),
      )
      .every((road) => roads.some((r) => r.link.from.carriageway === road)),
    'Every lock-line pavement belongs to an exit carriageway',
  );
  const cuts: number[] = [outerLeft];
  for (let i = 1; i < roads.length; i += 1) {
    const left = roads[i - 1]!.right,
      right = roads[i]!.left;
    check(
      stripSupportsInterval(material, lock.s, left, right),
      'Exit carriageways need a positive supported separating median',
    );
    cuts.push(left + (right - left) / 2);
  }
  cuts.push(outerRight);
  return Object.freeze({
    section,
    lock,
    closure,
    regions: Object.freeze(roads.map((r, i) => Object.freeze({ link: r.link, left: cuts[i]!, right: cuts[i + 1]! }))),
  });
}
