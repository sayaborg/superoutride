import { materialOuterEdges } from './course-coordinate-domain.js';
import type { StripMaterial } from './strip-material.js';
import type { SurfaceMaterial } from './surface-material.js';

/** A Section's physical ground: the material vehicles stand on, as support, tire contact and recovery read it. */
export interface CourseGround {
  /** The material at Section station `s` and chart lateral `l` (native lateral `l + lateralOrigin`), or null. */
  sampleInChart(s: number, l: number, lateralOrigin: number): SurfaceMaterial | null;
}

/**
 * A course limit pushes and the ground supports. The course limits are closed everywhere (K, 2026-11-12), so the ground
 * has one rule: beyond a limit the ground reads the material at the limit itself, the outermost covered material at
 * that station; inside the limits it is the material table, where material-free ground is a hole.
 */
export function compileCourseGround(material: StripMaterial, path: string): CourseGround {
  const edges = materialOuterEdges(material, path);
  const limits = { left: 0, right: 0 };
  return Object.freeze({
    sampleInChart(s: number, l: number, lateralOrigin: number) {
      edges.at(s, limits);
      if (limits.left - lateralOrigin > l) return edges.materialAt(s, 'left');
      if (limits.right - lateralOrigin <= l) return edges.materialAt(s, 'right');
      return material.sampleInChart(s, l, lateralOrigin);
    },
  });
}
