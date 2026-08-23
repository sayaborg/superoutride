import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import type { M616ChildGuideCharts } from './m6-16-child-guide-charts.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';

export interface M618StageRoadViews {
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
export function createM618StageRoadViews(charts: M616ChildGuideCharts): M618StageRoadViews {
  const childRoadHalfWidth = M6_13_JUNCTION.authoring.childRoadWidth * 0.5;
  const shoulderWidth = M6_13_JUNCTION.authoring.shoulderWidth;
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
