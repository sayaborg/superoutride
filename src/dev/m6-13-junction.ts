import { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';

export const M6_13_JUNCTION = new JunctionCrossSectionProfile({
  sWidenStart: 390,
  sMedianStart: 430,
  sSeparatedStart: 530,
  parentRoadWidth: 9,
  childRoadWidth: 7,
  finalMedianWidth: 8,
  shoulderWidth: 1,
});

/**
 * DEV rival path for the visible split. This is only an AI target and never a route-choice or
 * stage-handoff authority. It moves continuously from the parent centerline toward the right
 * child road while the parent road widens, then follows that child center as the median grows.
 */
export function sampleM613RightBranchTargetL(s: number): number {
  const a = M6_13_JUNCTION.authoring;
  if (s <= a.sWidenStart) return 0;
  if (s < a.sMedianStart) {
    const t = (s - a.sWidenStart) / (a.sMedianStart - a.sWidenStart);
    return t * a.childRoadWidth * 0.5;
  }
  return M6_13_JUNCTION.sample(s).childCenterL?.RIGHT ?? a.childRoadWidth * 0.5;
}
