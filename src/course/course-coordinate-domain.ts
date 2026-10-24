import { stripEdgeAt, stripSlabAt, type StripEdgeLine } from './strip-slabs.js';
import type { StripMaterial } from './strip-material.js';
import type { Writable } from '../core/writable.js';
import { CourseInputError } from './course-diagnostics.js';

/**
 * The product's bound on vehicle reach in metres (the footprint's half diagonal). Vehicle admission rejects a vehicle
 * beyond it, so a vehicle centred on covered material keeps its whole footprint, at any yaw, in the lateral domain.
 */
export const MAXIMUM_VEHICLE_REACH = 4;

export interface CompiledPlanLateralDomain {
  readonly stations: readonly number[];
  lateralAt(s: number, out: Writable<{ left: number; right: number }>): { left: number; right: number };
}

/**
 * The outer edges of a Section's covered material: at each station its leftmost and rightmost finite covered edges, affine
 * within each material slab (`stations` are the slab ends).
 */
export function materialOuterEdges(material: StripMaterial, path: string) {
  const stations = [material.slabs[0]!.start, ...material.slabs.map((slab) => slab.end)];
  const edges = material.slabs.map((slab) => {
    const spans = slab.spans.filter((span) => span.value !== null);
    if (!spans.length)
      throw new CourseInputError(
        'material_coverage_gap',
        path,
        'Material table needs finite edges throughout the Section',
      );
    return { left: spans[0]!, right: spans.at(-1)! };
  });
  return Object.freeze({
    stations: Object.freeze(stations),
    at(s: number, out: Writable<{ left: number; right: number }>) {
      const edge = edges[stripSlabAt(material.slabs, s)]!;
      out.left = stripEdgeAt(edge.left, 'left', s);
      out.right = stripEdgeAt(edge.right, 'right', s);
      return out;
    },
    /** The material of the outermost covered span on one side at s. */
    materialAt(s: number, side: 'left' | 'right') {
      return edges[stripSlabAt(material.slabs, s)]![side].value!;
    },
    /** The edge's lateral change per metre of station at s, within its slab. */
    slopeAt(s: number, side: 'left' | 'right') {
      const line = edges[stripSlabAt(material.slabs, s)]![side][side]!;
      return (line.to - line.from) / (line.end - line.start);
    },
  });
}

/** Whether two edge lines are one line: both open, or the same affine line and offset. */
const sameLine = (a: StripEdgeLine | null, b: StripEdgeLine | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.start === b.start &&
    a.end === b.end &&
    a.from === b.from &&
    a.to === b.to &&
    a.offset === b.offset);

/**
 * A Section's lateral domain: its material's outer edges widened by `MAXIMUM_VEHICLE_REACH`, one-to-one because the
 * material ends within the plan's clearance less that reach (`clearanceClips`). Its stations are where those edges
 * change (the Section's ends, and each slab end where an outer edge's line differs), so a material that splits the
 * table without moving an outer edge (a patch on the road, water out to the edge) adds none.
 */
export function compileMaterialCoordinateDomain(
  material: StripMaterial,
  sectionPath: string,
): CompiledPlanLateralDomain {
  const edges = materialOuterEdges(material, `${sectionPath}/strips`);
  const outer = material.slabs.map((slab) => {
    const spans = slab.spans.filter((span) => span.value !== null);
    return { left: spans[0]!, right: spans.at(-1)! };
  });
  const changes = edges.stations.filter((_, i) => {
    if (i === 0 || i === outer.length) return true;
    const [a, b] = [outer[i - 1]!, outer[i]!];
    return !(sameLine(a.left.left, b.left.left) && sameLine(a.right.right, b.right.right));
  });
  return Object.freeze({
    stations: Object.freeze(changes),
    lateralAt(s: number, out: Writable<{ left: number; right: number }>) {
      edges.at(s, out);
      out.left -= MAXIMUM_VEHICLE_REACH;
      out.right += MAXIMUM_VEHICLE_REACH;
      return out;
    },
  });
}
