import type { GuideCurve } from '../core/guide-curve.js';
import type { JunctionCrossSectionProfile, JunctionSide } from '../course/junction-cross-section.js';
import { createGuideChart, type GuideChart } from '../gameplay/guide-chart.js';
import { M6_13_JUNCTION } from './m6-13-junction.js';

export interface M616ChildGuideCharts {
  readonly parent: GuideChart;
  readonly left: GuideChart;
  readonly right: GuideChart;
}

/**
 * The separated child-road centers become independent l=0 chart origins while
 * all three charts still refer to exactly the same overlap world geometry.
 */
export function createM616ChildGuideCharts(
  guide: GuideCurve,
  junction: JunctionCrossSectionProfile = M6_13_JUNCTION,
): M616ChildGuideCharts {
  return Object.freeze({
    parent: createGuideChart('PARENT', guide, 0),
    left: createGuideChart('LEFT_CHILD', guide, junction.separatedChildCenterL('LEFT')),
    right: createGuideChart('RIGHT_CHILD', guide, junction.separatedChildCenterL('RIGHT')),
  });
}

export function childChartForSide(charts: M616ChildGuideCharts, side: JunctionSide): GuideChart {
  return side === 'LEFT' ? charts.left : charts.right;
}
