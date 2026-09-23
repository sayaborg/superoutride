import { bandEdgeAt, type BandGround, type BandPiece } from '../band-ground.js';
import { requireCourse } from '../course-diagnostics.js';
import type { LegacyOverlapLink } from './course-graph.js';
import type { CourseQueryExtent } from './course-consumer-demand.js';
import { coursePortLateral } from './course-links.js';

/** Prove the resolved color field on the shared guard, independently of physical Regions or hidden colors. */
export function compareCourseBandOverlap(
  link: LegacyOverlapLink,
  a: BandGround,
  b: BandGround,
  domain: CourseQueryExtent,
) {
  const ports = [link.from, link.to],
    grounds = [a, b],
    cuts = new Set([-link.overlap.behind, link.overlap.ahead]);
  grounds.forEach((ground, i) => {
    const port = ports[i]!,
      origin = coursePortLateral(port);
    for (const slab of ground.slabs) {
      cuts.add(slab.start - port.anchor.s);
      cuts.add(slab.end - port.anchor.s);
      for (const piece of slab.spans)
        for (const side of ['left', 'right'] as const)
          for (const l of [origin - domain.left, origin + domain.right]) {
            if (piece[side] === null) continue;
            const x0 = bandEdgeAt(piece, side, slab.start),
              x1 = bandEdgeAt(piece, side, slab.end);
            if ((x0 < l && x1 > l) || (x0 > l && x1 < l))
              cuts.add(slab.start + ((slab.end - slab.start) * (l - x0)) / (x1 - x0) - port.anchor.s);
          }
    }
    port.section.presentation!.environments.forEach((e) => cuts.add(e.anchor.s - port.anchor.s));
  });
  const stations = [...cuts].filter((s) => s >= -link.overlap.behind && s <= link.overlap.ahead).sort((x, y) => x - y);
  const regions = (ground: BandGround, index: number, start: number, end: number) => {
    const port = ports[index]!,
      origin = coursePortLateral(port),
      s = port.anchor.s + start,
      t = port.anchor.s + end,
      middle = s + (t - s) / 2;
    const slab = ground.slabs.find((cell) => cell.start <= middle && (middle < cell.end || middle === ground.length))!;
    const edge = (p: BandPiece, side: 'left' | 'right', at: number) =>
      Math.max(-domain.left, Math.min(domain.right, bandEdgeAt(p, side, at) - origin));
    return slab.spans.flatMap((p) => {
      if (!(edge(p, 'right', middle) > edge(p, 'left', middle))) return [];
      return [
        {
          color: p.color,
          left: edge(p, 'left', s),
          right: edge(p, 'right', s),
          leftEnd: edge(p, 'left', t),
          rightEnd: edge(p, 'right', t),
        },
      ];
    });
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    const start = stations[i]!,
      end = stations[i + 1]!,
      ar = regions(a, 0, start, end),
      br = regions(b, 1, start, end);
    requireCourse(
      ar.length === br.length &&
        ar.every(
          (p, j) =>
            p.color === br[j]!.color &&
            (['left', 'right', 'leftEnd', 'rightEnd'] as const).every((key) => Math.abs(p[key] - br[j]![key]) <= 1e-9),
        ),
      '',
      `Band colors or edges disagree in shared guard [${start}, ${end}]`,
      'presentation_ground_mismatch',
    );
  }
  return stations;
}
