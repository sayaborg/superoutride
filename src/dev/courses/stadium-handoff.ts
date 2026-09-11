import type { GuidePath } from '../../core/guide-curve.js';
import { guidePathToWorld } from '../../core/guide-curve.js';
import type { JunctionSide } from '../../course/junction-cross-section.js';
import type { RouteDag } from '../../gameplay/route-dag.js';
import {
  compileRouteStageHandoffManifest,
  type RouteStageHandoffManifest,
  type RouteStageHandoffSeamAuthoring,
} from '../../gameplay/route-stage-handoff.js';
import type { ChildGuideCharts } from './child-guide-charts.js';
import { STADIUM_JUNCTION } from './stadium-junction.js';
import { STADIUM_ROUTE_GATE_S } from './stadium-route-gates.js';

/**
 * Authored overlap handoff seam. It is intentionally after the physical route-choice gate.
 * Future content may place occluding scenery before this seam without making gameplay depend on
 * screen visibility.
 */
export const STADIUM_HANDOFF_SEAM_S = 600;

const CHOICE_SIDE: Readonly<Record<string, JunctionSide>> = Object.freeze({
  S1_LEFT: 'LEFT',
  S1_RIGHT: 'RIGHT',
  S2L_LEFT: 'LEFT',
  S2L_RIGHT: 'RIGHT',
  S2R_LEFT: 'LEFT',
  S2R_RIGHT: 'RIGHT',
});

export function createStadiumRouteStageHandoffManifest(
  route: RouteDag,
  guide: GuidePath,
  charts: ChildGuideCharts,
): RouteStageHandoffManifest {
  if (!(STADIUM_HANDOFF_SEAM_S > STADIUM_ROUTE_GATE_S)) {
    throw new Error('handoff seam must be after visible route-selection gate');
  }
  if (!(STADIUM_HANDOFF_SEAM_S < guide.length)) {
    throw new RangeError('handoff seam must lie inside the DEV course');
  }
  const section = STADIUM_JUNCTION.sample(STADIUM_HANDOFF_SEAM_S);
  if (section.phase !== 'SEPARATED') throw new Error('handoff seam requires fully separated child roads');

  const authoring: RouteStageHandoffSeamAuthoring[] = route.choices.map((choice) => {
    const side = CHOICE_SIDE[choice.id];
    if (!side) throw new Error(`DEV handoff side missing for route choice: ${choice.id}`);
    const l = STADIUM_JUNCTION.separatedChildCenterL(side);
    const center = guidePathToWorld(guide, STADIUM_HANDOFF_SEAM_S, l);
    const sourceOrigin =
      choice.fromStageId === route.startStageId
        ? charts.parent.lateralOrigin
        : choice.fromStageId.includes('_L')
          ? charts.left.lateralOrigin
          : charts.right.lateralOrigin;
    return {
      id: `H_${choice.id}`,
      choiceId: choice.id,
      targetChartId: side === 'LEFT' ? charts.left.id : charts.right.id,
      sourceSeamS: STADIUM_HANDOFF_SEAM_S,
      targetSeamS: STADIUM_HANDOFF_SEAM_S,
      sourceLocalL: l - sourceOrigin,
      targetLocalL: 0,
      center: { x: center.x, z: center.z },
      heading: center.heading,
      halfWidth: STADIUM_JUNCTION.authoring.childRoadWidth * 0.5,
    };
  });

  return compileRouteStageHandoffManifest(route, [charts.parent, charts.left, charts.right], authoring);
}
