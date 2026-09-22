import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../image/sprite.js';
import { guidePathToWorld } from '../geometry/guide-curve.js';
import { courseBoundaryAt } from '../course-regions.js';
import { requireCourse } from '../course-diagnostics.js';
import type { CompiledCourseAnchor } from '../course-geometry.js';
import { coursePhysicalMaterialAt } from '../course-physical-binding.js';
import type { CompiledFork, CompiledSection } from './course-graph.js';
import { requireCourseStraightSpan } from './course-links.js';

/** Resolve parallel-zone geometry after canonical outgoing Links exist, before publication. */
export function compileCourseFork(
  section: CompiledSection,
  anchors: { readonly lock: CompiledCourseAnchor; readonly closure: CompiledCourseAnchor } | null,
  path: string,
): CompiledFork | null {
  const conditional = section.presentation?.scenery.filter((p) => p.unselected !== null) ?? [];
  if (anchors === null) {
    requireCourse(conditional.length === 0, path, 'State-selected road signs require a fork', 'invalid_fork');
    return null;
  }
  const { lock, closure } = anchors;
  const check = (condition: boolean, message: string) => requireCourse(condition, path, message, 'invalid_fork');
  check(section.outgoing.length >= 2, 'A fork requires two or three canonical exits');
  check(
    lock.s > 0 && lock.s < closure.s && section.outgoing.every((l) => closure.s < l.source.anchor.s),
    'Fork anchors require 0 < lock < closure < every exit seam',
  );
  check(
    section.incoming.every((l) => l.destination.anchor.s < lock.s),
    'Fork lock must follow its entry',
  );
  for (const placement of conditional) {
    check(
      section.outgoing.some((link) => link.source.carriageway === placement.unselected),
      'Road sign state must name a canonical exit carriageway',
    );
    check(placement.anchor.s >= lock.s && placement.anchor.s <= closure.s, 'Road signs lie between lock and closure');
    check(
      section.outgoing.every(
        (link) =>
          placement.anchor.s + placement.instance.asset.source.width / SPRITE_SOURCE_TEXELS_PER_METER <
          link.source.anchor.s - link.overlap.behind,
      ),
      'State-selected signs must precede common exit guards',
    );
  }
  requireCourseStraightSpan(
    section,
    lock.s,
    closure.s,
    guidePathToWorld(section.guide, lock.s, 0, createPlanarCoordinateSample()).heading,
    path,
  );
  const regions = section.regionPartition.regions.filter((b) => b.start.s <= lock.s && b.end.s > lock.s);
  check(regions.length > 0, 'Lock line needs supported Regions');
  for (const region of regions) {
    check(region.end.s > closure.s, 'Parallel-zone Regions must include closure in their half-open domains');
    for (const boundary of [region.left, region.right]) {
      const value = courseBoundaryAt(boundary, lock.s);
      check(
        courseBoundaryAt(boundary, closure.s) === value &&
          boundary.knots.every((k) => k.anchor.s <= lock.s || k.anchor.s >= closure.s || k.l === value),
        'Lock-to-closure boundaries must remain parallel',
      );
    }
    const binding = section.physicalBindings.find((b) => b.region === region);
    if (!binding) throw new Error('Compiled Region has no physical binding');
    check(
      coursePhysicalMaterialAt(binding, lock.s).supported &&
        binding.sections.every((s) => s.anchor.s <= lock.s || s.anchor.s > closure.s || s.material.supported),
      'Parallel-zone roads and medians must remain supported',
    );
  }
  const ordered = regions
    .map((region) => ({
      region,
      left: courseBoundaryAt(region.left, lock.s),
      right: courseBoundaryAt(region.right, lock.s),
    }))
    .filter((b) => b.right > b.left)
    .sort((a, b) => a.left - b.left);
  check(
    ordered.length > 0 && ordered.every((b, i) => i === 0 || ordered[i - 1]!.right === b.left),
    'Supported lock space must be one continuous interval',
  );
  const roads = section.outgoing
    .map((link) => {
      const parts = ordered.filter((b) => link.source.carriageway.regions.includes(b.region));
      check(parts.length > 0, 'Each exit carriageway must have positive width at lock');
      return { link, left: parts[0]!.left, right: parts.at(-1)!.right };
    })
    .sort((a, b) => a.left - b.left);
  check(
    ordered.every(
      (b) => b.region.role !== 'pavement' || roads.some((r) => r.link.source.carriageway.regions.includes(b.region)),
    ),
    'Every lock-line pavement belongs to an exit carriageway',
  );
  const cuts: number[] = [ordered[0]!.left];
  for (let i = 1; i < roads.length; i += 1) {
    const left = roads[i - 1]!.right,
      right = roads[i]!.left;
    check(
      right > left && ordered.filter((b) => b.left < right && b.right > left).every((b) => b.region.role === 'median'),
      'Exit carriageways need a positive supported separating median',
    );
    cuts.push(left + (right - left) / 2);
  }
  cuts.push(ordered.at(-1)!.right);
  return Object.freeze({
    section,
    lock,
    closure,
    regions: Object.freeze(roads.map((r, i) => Object.freeze({ link: r.link, left: cuts[i]!, right: cuts[i + 1]! }))),
  });
}
