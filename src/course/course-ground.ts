import type { CourseBarrierLine } from './course-barriers.js';
import { materialOuterEdges } from './course-coordinate-domain.js';
import type { StripMaterial } from './strip-material.js';
import type { SurfaceMaterial } from './surface-material.js';

/** A Section's physical ground: the material vehicles stand on, as support, tire contact and recovery read it. */
export interface CourseGround {
  /** The material at Section station `s` and chart lateral `l` (native lateral `l + lateralOrigin`), or null. */
  sampleInChart(s: number, l: number, lateralOrigin: number): SurfaceMaterial | null;
}

/**
 * A course limit pushes and the ground supports. Behind a closed course limit the ground continues: beyond the limit, on
 * its closed side, the ground reads the material at the limit itself, the outermost covered material at that station.
 * Over an open limit, and inside the limits, the ground is the material table.
 */
export function compileCourseGround(
  material: StripMaterial,
  barriers: readonly CourseBarrierLine[],
  path: string,
): CourseGround {
  const edges = materialOuterEdges(material, path);
  // A left limit keeps vehicles to its right (+1), a right limit to its left (−1).
  const left = barriers.filter((line) => line.keep === 1),
    right = barriers.filter((line) => line.keep === -1);
  const closed = (lines: readonly CourseBarrierLine[], s: number) =>
    lines.some((line) => s >= line.start && s <= line.end);
  const limits = { left: 0, right: 0 };
  return Object.freeze({
    sampleInChart(s: number, l: number, lateralOrigin: number) {
      edges.at(s, limits);
      if (limits.left - lateralOrigin > l && closed(left, s)) return edges.materialAt(s, 'left');
      if (limits.right - lateralOrigin <= l && closed(right, s)) return edges.materialAt(s, 'right');
      return material.sampleInChart(s, l, lateralOrigin);
    },
  });
}
