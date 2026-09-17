import { classifyStageRoadLocalL, stageRoadSourceLateral, type StageRoadView } from '../course/stage-road-view.js';
import {
  sampleRoadRegionColor,
  sampleGroundMap,
  sampleJunctionGroundMap,
  type GroundMapProfile,
} from './ground-map.js';

/**
 * Stage-local GroundMap sampling without duplicating reusable source data.
 *
 * `stageJunction`, when present, is classified before the fixed single-road StageRoadView. This lets
 * an ordinary successor road widen and split around active-stage local l=0 while the underlying
 * source `junction`, if any, keeps its original source-coordinate meaning after lateral rebasing.
 */
export function sampleStageGroundMapAtLevel(
  s: number,
  localL: number,
  level: number,
  view: StageRoadView,
  profile: GroundMapProfile,
): number {
  const localClass = classifyStageRoadLocalL(view, localL);
  if (localClass === 'OUTSIDE') throw new RangeError('stage GroundMap sample is outside the local ground envelope');

  const sourceS = s + (profile.chainageOffsetS ?? 0);
  if (profile.stageJunction) {
    const junctionColor = sampleJunctionGroundMap(s, localL, profile.stageJunction, profile.junctionMarkings, sourceS);
    if (junctionColor !== null) return junctionColor;
  }

  if (localClass === 'SHOULDER') return sampleRoadRegionColor(localClass, sourceS, localL)!;

  const sourceL = stageRoadSourceLateral(view, localL);
  return profile.baked ? profile.baked.sampleAtLevel(sourceS, sourceL, level) : sampleGroundMap(s, sourceL, profile);
}
