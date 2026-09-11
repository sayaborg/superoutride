import { createStageRoadView, type StageRoadView } from '../../course/stage-road-view.js';
import type { ChildGuideCharts } from '../courses/child-guide-charts.js';
import { STADIUM_JUNCTION } from '../courses/stadium-junction.js';

export interface StageRoadViews {
  readonly parent: StageRoadView;
  readonly left: StageRoadView;
  readonly right: StageRoadView;
}

/**
 * Runtime road-strip views for the current DEV junction.
 *
 * Parent keeps the original +/-12m authored corridor. A committed child stage keeps only its
 * 7m asphalt road plus one 1m shoulder on each side: local ground envelope +/-4.5m.
 * The other child road is therefore outside that stage-local renderer/physics source corridor.
 */
export function createStageRoadViews(charts: ChildGuideCharts): StageRoadViews {
  const childRoadHalfWidth = STADIUM_JUNCTION.authoring.childRoadWidth * 0.5;
  const shoulderWidth = STADIUM_JUNCTION.authoring.shoulderWidth;
  const childGroundHalfWidth = childRoadHalfWidth + shoulderWidth;

  return Object.freeze({
    parent: createStageRoadView({
      id: 'PARENT_ROAD_VIEW',
      sourceLateralOrigin: charts.parent.lateralOrigin,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      shoulderWidth: 1,
    }),
    left: createStageRoadView({
      id: 'LEFT_CHILD_ROAD_VIEW',
      sourceLateralOrigin: charts.left.lateralOrigin,
      groundLeft: childGroundHalfWidth,
      groundRight: childGroundHalfWidth,
      roadLeft: childRoadHalfWidth,
      roadRight: childRoadHalfWidth,
      shoulderWidth,
    }),
    right: createStageRoadView({
      id: 'RIGHT_CHILD_ROAD_VIEW',
      sourceLateralOrigin: charts.right.lateralOrigin,
      groundLeft: childGroundHalfWidth,
      groundRight: childGroundHalfWidth,
      roadLeft: childRoadHalfWidth,
      roadRight: childRoadHalfWidth,
      shoulderWidth,
    }),
  });
}
