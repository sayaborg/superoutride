import type { GuidePath } from '../../core/guide-curve.js';
import type { JunctionCrossSectionProfile } from '../../course/junction-cross-section.js';
import { createGuideChart, type GuideChart } from '../../gameplay/guide-chart.js';
import { STADIUM_JUNCTION } from './stadium-junction.js';

export interface ChildGuideCharts {
  readonly parent: GuideChart;
  readonly left: GuideChart;
  readonly right: GuideChart;
}

/**
 * The separated child-road centers become independent l=0 chart origins while
 * all three charts still refer to exactly the same overlap world geometry.
 */
export function createChildGuideCharts(
  guide: GuidePath,
  junction: JunctionCrossSectionProfile = STADIUM_JUNCTION,
): ChildGuideCharts {
  return Object.freeze({
    parent: createGuideChart('PARENT', guide, 0),
    left: createGuideChart('LEFT_CHILD', guide, junction.separatedChildCenterL('LEFT')),
    right: createGuideChart('RIGHT_CHILD', guide, junction.separatedChildCenterL('RIGHT')),
  });
}
