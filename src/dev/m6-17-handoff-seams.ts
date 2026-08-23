import type { GuideCurve } from '../core/guide-curve.js';
import { guideCourseToWorld } from '../core/guide-curve.js';
import type { JunctionSide } from '../course/junction-cross-section.js';
import type { RouteDag } from '../gameplay/route-dag.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../gameplay/route-stage-handoff.js';
import type { M616ChildGuideCharts } from './m6-16-child-guide-charts.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';
import { M6_15_ROUTE_GATE_S } from './m6-15-visible-route-gates.js';

/**
 * Authored overlap handoff seam. It is intentionally after the physical route-choice gate.
 * Future content may place occluding scenery before this seam without making gameplay depend on
 * screen visibility.
 */
export const M6_17_HANDOFF_SEAM_S = 600;

const CHOICE_SIDE: Readonly<Record<string, JunctionSide>> = Object.freeze({
  S1_LEFT: 'LEFT',
  S1_RIGHT: 'RIGHT',
  S2L_LEFT: 'LEFT',
  S2L_RIGHT: 'RIGHT',
  S2R_LEFT: 'LEFT',
  S2R_RIGHT: 'RIGHT',
});

export function createM617RouteStageHandoffManifest(
  route: RouteDag,
  guide: GuideCurve,
  charts: M616ChildGuideCharts,
): RouteStageHandoffManifest {
  if (!(M6_17_HANDOFF_SEAM_S > M6_15_ROUTE_GATE_S)) {
    throw new Error('handoff seam must be after visible route-selection gate');
  }
  if (!(M6_17_HANDOFF_SEAM_S < guide.length)) {
    throw new RangeError('handoff seam must lie inside the DEV course');
  }
  const section = M6_13_JUNCTION.sample(M6_17_HANDOFF_SEAM_S);
  if (section.phase !== 'SEPARATED') throw new Error('handoff seam requires fully separated child roads');

  const authoring: RouteStageHandoffSeamAuthoring[] = route.choices.map((choice) => {
    const side = CHOICE_SIDE[choice.id];
    if (!side) throw new Error(`DEV handoff side missing for route choice: ${choice.id}`);
    const l = M6_13_JUNCTION.separatedChildCenterL(side);
    const center = guideCourseToWorld(guide, M6_17_HANDOFF_SEAM_S, l);
    return {
      id: `H_${choice.id}`,
      choiceId: choice.id,
      targetChartId: side === 'LEFT' ? charts.left.id : charts.right.id,
      center: { x: center.x, z: center.z },
      heading: center.heading,
      halfWidth: M6_13_JUNCTION.authoring.childRoadWidth * 0.5,
    };
  });

  return compileRouteStageHandoffManifest(route, [charts.parent, charts.left, charts.right], authoring);
}
