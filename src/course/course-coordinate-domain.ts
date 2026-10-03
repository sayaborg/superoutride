import { stripEdgeAt, stripSlabAt } from './strip-slabs.js';
import type { StripMaterial } from './strip-material.js';
import type { Writable } from '../core/writable.js';
import { CourseInputError, requireCourse } from './course-diagnostics.js';
import { validatePlanDomainInjectivity } from './plan-domain-injectivity.js';
import type { CompiledPlanSegment } from './geometry/plan-path.js';

/**
 * The product's bound on vehicle reach in metres (the footprint's half diagonal). Vehicle admission rejects a vehicle
 * beyond it, so a vehicle centred on covered material keeps its whole footprint, at any yaw, in the lateral domain.
 */
export const MAXIMUM_VEHICLE_REACH = 4;

export interface CompiledPlanLateralDomain {
  readonly stations: readonly number[];
  lateralAt(s: number, out: Writable<{ left: number; right: number }>): { left: number; right: number };
}

function lateralDomain(material: StripMaterial, path: string): CompiledPlanLateralDomain {
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
    lateralAt(s: number, out: Writable<{ left: number; right: number }>) {
      const edge = edges[stripSlabAt(material.slabs, s)]!;
      out.left = stripEdgeAt(edge.left, 'left', s) - MAXIMUM_VEHICLE_REACH;
      out.right = stripEdgeAt(edge.right, 'right', s) + MAXIMUM_VEHICLE_REACH;
      return out;
    },
  });
}

export function compileMaterialCoordinateDomain(
  sectionId: string,
  segments: readonly CompiledPlanSegment[],
  material: StripMaterial,
  sectionPath: string,
): CompiledPlanLateralDomain {
  const domain = lateralDomain(material, `${sectionPath}/strips`);
  validatePlanMetric(sectionId, segments, domain, sectionPath);
  validatePlanDomainInjectivity(sectionId, segments, domain, sectionPath);
  return domain;
}

function validatePlanMetric(
  sectionId: string,
  segments: readonly CompiledPlanSegment[],
  domain: CompiledPlanLateralDomain,
  sectionPath: string,
): void {
  const bounds = { left: 0, right: 0 };
  for (const segment of segments) {
    if (segment.curvature === 0) continue;
    const stations = [
      segment.sStart,
      ...domain.stations.filter((s) => s > segment.sStart && s < segment.sEnd),
      segment.sEnd,
    ];
    for (const s of stations) {
      domain.lateralAt(s, bounds);
      const l = segment.curvature > 0 ? bounds.right : bounds.left;
      const metric = 1 - segment.curvature * l;
      requireCourse(
        metric > 0,
        `${sectionPath}/pis`,
        `Section ${JSON.stringify(sectionId)} has 1 - kappa*l <= 0 at s=${s}`,
        'plan_coordinate_inversion',
      );
    }
  }
}
