import { JunctionCrossSectionProfile } from '../../../course/junction-cross-section.js';

import { compileRoadCrossSection } from '../../../course/road-cross-section.js';

export const STADIUM_ROAD_CROSS_SECTION = compileRoadCrossSection({ roadLeft: 4.5, roadRight: 4.5, shoulderWidth: 1 });

export const STADIUM_JUNCTION = new JunctionCrossSectionProfile({
  sWidenStart: 390,
  sMedianStart: 430,
  sSeparatedStart: 530,
  parent: STADIUM_ROAD_CROSS_SECTION,
  childRoadWidth: 7,
  finalMedianWidth: 8,
});

/**
 * DEV rival path for the visible split. This is only an AI target and never a route-choice or
 * stage-handoff authority. It moves continuously from the parent centerline toward the right
 * child road while the parent road widens, then follows that child center as the median grows.
 */
export function sampleStadiumRightBranchTargetL(s: number): number {
  const a = STADIUM_JUNCTION.authoring;
  if (s <= a.sWidenStart) return 0;
  if (s < a.sMedianStart) {
    const t = (s - a.sWidenStart) / (a.sMedianStart - a.sWidenStart);
    return t * a.childRoadWidth * 0.5;
  }
  return STADIUM_JUNCTION.sample(s).childCenterL?.RIGHT ?? a.childRoadWidth * 0.5;
}
