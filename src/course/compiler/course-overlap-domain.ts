import { courseBoundaryAt } from '../course-regions.js';
import { requireCourse } from '../course-diagnostics.js';
import type { LegacyOverlapLink, CompiledPort } from './course-graph.js';
import { coursePortLateral } from './course-links.js';
import type { CourseQueryExtent } from './course-consumer-demand.js';

type LateralDomain = Pick<CourseQueryExtent, 'left' | 'right'>;

export function requireCanonicalCourseLinks(links: readonly LegacyOverlapLink[]): void {
  if (!Array.isArray(links)) throw new TypeError('Qualification requires a canonical Link array');
  if (new Set(links).size !== links.length) throw new RangeError('Qualification Links must be unique');
  for (const link of links) {
    if (!link || typeof link !== 'object' || !link.from || !link.to)
      throw new TypeError('Qualification requires compiled Link objects');
    if (!link.from.section.outgoing.includes(link) || !link.to.section.incoming.includes(link))
      throw new RangeError('Qualification requires canonical compiled Link references');
  }
}

/** All activation/knot/domain-edge crossings; content owners contribute their own profile stations. */
export function courseOverlapRuler(
  port: CompiledPort,
  overlap: LegacyOverlapLink['overlap'],
  domain: LateralDomain | undefined,
  profileStations: readonly number[],
) {
  const crossings: number[] = [];
  const regions = port.section.regionPartition.regions;
  if (domain) {
    const origin = coursePortLateral(port);
    for (const region of regions)
      for (const boundary of [region.left, region.right]) {
        for (let i = 1; i < boundary.knots.length; i += 1) {
          const a = boundary.knots[i - 1]!,
            b = boundary.knots[i]!;
          const start = Math.max(a.anchor.s, region.start.s, port.anchor.s - overlap.behind);
          const end = Math.min(b.anchor.s, region.end.s, port.anchor.s + overlap.ahead);
          if (end <= start) continue;
          const l0 = courseBoundaryAt(boundary, start) - origin,
            l1 = courseBoundaryAt(boundary, end) - origin;
          for (const edge of [-domain.left, domain.right]) {
            if (!(edge > Math.min(l0, l1) && edge < Math.max(l0, l1))) continue;
            const s = start + (end - start) * ((edge - l0) / (l1 - l0));
            requireCourse(
              s > start && s < end,
              '',
              'Domain-edge crossing must remain distinct in the source ruler',
              'unrepresentable_overlap',
            );
            crossings.push(s);
          }
        }
      }
  }
  return {
    seam: port.anchor.s,
    stations: [
      ...crossings,
      ...regions.flatMap((region) => [
        region.start.s,
        region.end.s,
        ...[region.left, region.right].flatMap((b) => b.knots.map((k) => k.anchor.s)),
      ]),
      ...profileStations,
    ],
  };
}

/** Linear clipped edges on one already partitioned cell, or exact half-open station ownership. */
export function courseOverlapRegions(port: CompiledPort, start: number, end: number, domain?: LateralDomain) {
  const origin = coursePortLateral(port),
    point = start === end;
  const clip = (l: number) => (domain ? Math.max(-domain.left, Math.min(domain.right, l)) : l);
  return port.section.regionPartition.regions
    .flatMap((region) => {
      if (
        region.start.s > start ||
        region.end.s < end ||
        (point && start === region.end.s && start !== port.section.regionPartition.length)
      )
        return [];
      const left = clip(courseBoundaryAt(region.left, start) - origin),
        right = clip(courseBoundaryAt(region.right, start) - origin);
      const leftEnd = clip(courseBoundaryAt(region.left, end) - origin),
        rightEnd = clip(courseBoundaryAt(region.right, end) - origin);
      return left === right && leftEnd === rightEnd ? [] : [{ region, left, right, leftEnd, rightEnd }];
    })
    .sort((a, b) => a.left + a.leftEnd - (b.left + b.leftEnd));
}

/** The complete analytic interval must be horizontal, including each parabola. */
export function courseOverlapHeight(port: CompiledPort, overlap: LegacyOverlapLink['overlap'], path: string): number {
  const start = port.anchor.s - overlap.behind,
    end = port.anchor.s + overlap.ahead;
  const profile = port.section.height;
  const stations = [
    start,
    end,
    ...profile.knots.flatMap((k) => [k.s - k.curveLength / 2, k.s, k.s + k.curveLength / 2]),
  ]
    .filter((s) => s >= start && s <= end)
    .sort((a, b) => a - b);
  const y = profile.sample(start);
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!,
      b = stations[i]!;
    if (b === a) continue;
    requireCourse(
      profile.sampleDifferential((a + b) / 2).dYdS === 0 && profile.sample(a) === y && profile.sample(b) === y,
      path,
      'Common overlap must be horizontal throughout its guard',
      'nonhorizontal_overlap',
    );
  }
  return profile.sample(port.anchor.s);
}
