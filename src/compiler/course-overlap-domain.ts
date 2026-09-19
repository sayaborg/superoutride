import { courseBoundaryAt } from '../course/course-bands.js';
import { requireCourse } from '../course/course-diagnostics.js';
import type { CompiledLink, CompiledPort } from './course-graph.js';
import { coursePortLateral } from './course-links.js';
import type { CourseQueryExtent } from './course-consumer-demand.js';

type LateralDomain = Pick<CourseQueryExtent, 'left' | 'right'>;

export function requireCanonicalCourseLinks(links: readonly CompiledLink[]): void {
  if (!Array.isArray(links)) throw new TypeError('Qualification requires a canonical Link array');
  if (new Set(links).size !== links.length) throw new RangeError('Qualification Links must be unique');
  for (const link of links) {
    if (!link || typeof link !== 'object' || !link.source || !link.destination)
      throw new TypeError('Qualification requires compiled Link objects');
    if (!link.source.section.outgoing.includes(link) || !link.destination.section.incoming.includes(link))
      throw new RangeError('Qualification requires canonical compiled Link references');
  }
}

/** All activation/knot/domain-edge crossings; content owners contribute their own profile stations. */
export function courseOverlapRuler(
  port: CompiledPort,
  overlap: CompiledLink['overlap'],
  domain: LateralDomain | undefined,
  profileStations: readonly number[],
) {
  const crossings: number[] = [];
  const bands = port.section.bandPartition.bands;
  if (domain) {
    const origin = coursePortLateral(port);
    for (const band of bands)
      for (const boundary of [band.left, band.right]) {
        for (let i = 1; i < boundary.knots.length; i += 1) {
          const a = boundary.knots[i - 1]!,
            b = boundary.knots[i]!;
          const start = Math.max(a.anchor.s, band.start.s, port.anchor.s - overlap.behind);
          const end = Math.min(b.anchor.s, band.end.s, port.anchor.s + overlap.ahead);
          if (end <= start) continue;
          const l0 = courseBoundaryAt(boundary, start) - origin,
            l1 = courseBoundaryAt(boundary, end) - origin;
          for (const edge of [-domain.left, domain.right]) {
            if (!(edge > Math.min(l0, l1) && edge < Math.max(l0, l1))) continue;
            const s = start + (end - start) * ((edge - l0) / (l1 - l0));
            requireCourse(s > start && s < end, '', 'Domain-edge crossing must remain distinct in the source ruler');
            crossings.push(s);
          }
        }
      }
  }
  return {
    seam: port.anchor.s,
    stations: [
      ...crossings,
      ...bands.flatMap((band) => [
        band.start.s,
        band.end.s,
        ...[band.left, band.right].flatMap((b) => b.knots.map((k) => k.anchor.s)),
      ]),
      ...profileStations,
    ],
  };
}

/** Linear clipped edges on one already partitioned cell, or exact half-open station ownership. */
export function courseOverlapBandRegions(port: CompiledPort, start: number, end: number, domain?: LateralDomain) {
  const origin = coursePortLateral(port),
    point = start === end;
  const clip = (l: number) => (domain ? Math.max(-domain.left, Math.min(domain.right, l)) : l);
  return port.section.bandPartition.bands
    .flatMap((band) => {
      if (
        band.start.s > start ||
        band.end.s < end ||
        (point && start === band.end.s && start !== port.section.bandPartition.length)
      )
        return [];
      const left = clip(courseBoundaryAt(band.left, start) - origin),
        right = clip(courseBoundaryAt(band.right, start) - origin);
      const leftEnd = clip(courseBoundaryAt(band.left, end) - origin),
        rightEnd = clip(courseBoundaryAt(band.right, end) - origin);
      return left === right && leftEnd === rightEnd ? [] : [{ band, left, right, leftEnd, rightEnd }];
    })
    .sort((a, b) => a.left + a.leftEnd - (b.left + b.leftEnd));
}

/** Complete source height segments, not a seam-centre sample; also bounds smooth camera/physical height. */
export function courseOverlapHeight(port: CompiledPort, overlap: CompiledLink['overlap'], path: string): number {
  const start = port.anchor.s - overlap.behind,
    end = port.anchor.s + overlap.ahead;
  const nodes = port.section.height.nodes;
  for (let i = 1; i < nodes.length; i += 1) {
    const a = nodes[i - 1]!,
      b = nodes[i]!;
    if (a.s < end && b.s > start)
      requireCourse(
        a.y === b.y,
        path,
        'Common overlap must be horizontal throughout the complete height segments intersecting its guard',
        'nonhorizontal_overlap',
      );
  }
  return port.section.height.samplePhysics(port.anchor.s);
}
