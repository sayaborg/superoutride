import { stripEdgeAt, stripSlabAt } from './strip-ground.js';
import type { StripMaterial } from './strip-material.js';
import type { Writable } from '../core/writable.js';
import { CourseInputError, requireCourse } from './course-diagnostics.js';
import { validatePlanDomainInjectivity } from './plan-domain-injectivity.js';
import type { CompiledPlanSegment } from './geometry/plan-path.js';

const PLAN_COORDINATE_MARGIN_METERS = 4;

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
      out.left = stripEdgeAt(edge.left, 'left', s) - PLAN_COORDINATE_MARGIN_METERS;
      out.right = stripEdgeAt(edge.right, 'right', s) + PLAN_COORDINATE_MARGIN_METERS;
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

/** The union of material-bearing cells has matching limits at every slab transition. */
export function validateMaterialContinuity(material: StripMaterial, path: string): void {
  const union = (slab: StripMaterial['slabs'][number], s: number) => {
    const result: [number, number][] = [];
    for (const span of slab.spans) {
      if (span.value === null) continue;
      const left = stripEdgeAt(span, 'left', s),
        right = stripEdgeAt(span, 'right', s);
      if (left === right) continue;
      const previous = result.at(-1);
      if (previous && previous[1] >= left) previous[1] = Math.max(previous[1], right);
      else result.push([left, right]);
    }
    return result;
  };
  for (let i = 1; i < material.slabs.length; i++) {
    const s = material.slabs[i]!.start;
    const before = union(material.slabs[i - 1]!, s),
      after = union(material.slabs[i]!, s);
    requireCourse(
      before.length === after.length && before.every((r, j) => r[0] === after[j]![0] && r[1] === after[j]![1]),
      path,
      `Material union must be continuous at s=${s}`,
      'material_transition_discontinuity',
    );
  }
}
