import {
  classifyStageRoadLocalL,
  stageRoadSourceLateral,
  type StageRoadView,
} from '../course/stage-road-view.js';
import type { BakedGroundMapSample } from './baked-ground-map.js';
import {
  GROUND_COLORS,
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
export function sampleStageGroundMapRuntime(
  s: number,
  localL: number,
  deltaSEffective: number,
  view: StageRoadView,
  profile: GroundMapProfile,
  cliffSection = false,
): BakedGroundMapSample {
  const localClass = classifyStageRoadLocalL(view, localL);
  if (localClass === 'OUTSIDE') throw new RangeError('stage GroundMap sample is outside the local ground envelope');

  const sourceS = s + (profile.chainageOffsetS ?? 0);
  if (profile.stageJunction) {
    const junctionColor = sampleJunctionGroundMap(s, localL, profile.stageJunction, sourceS);
    if (junctionColor !== null) {
      return {
        color: junctionColor,
        level: profile.baked?.selectLevel(deltaSEffective) ?? 0,
      };
    }
  }

  if (localClass === 'SHOULDER') {
    return {
      color: GROUND_COLORS.shoulder,
      level: profile.baked?.selectLevel(deltaSEffective) ?? 0,
    };
  }

  const sourceL = stageRoadSourceLateral(view, localL);
  if (profile.baked) return profile.baked.sample(sourceS, sourceL, deltaSEffective);
  return {
    color: sampleGroundMap(s, sourceL, profile, cliffSection),
    level: 0,
  };
}

export function sampleStageGroundMapAtLevel(
  s: number,
  localL: number,
  level: number,
  view: StageRoadView,
  profile: GroundMapProfile,
  cliffSection = false,
): number {
  const localClass = classifyStageRoadLocalL(view, localL);
  if (localClass === 'OUTSIDE') throw new RangeError('stage GroundMap sample is outside the local ground envelope');

  const sourceS = s + (profile.chainageOffsetS ?? 0);
  if (profile.stageJunction) {
    const junctionColor = sampleJunctionGroundMap(s, localL, profile.stageJunction, sourceS);
    if (junctionColor !== null) return junctionColor;
  }

  if (localClass === 'SHOULDER') return GROUND_COLORS.shoulder;

  const sourceL = stageRoadSourceLateral(view, localL);
  return profile.baked
    ? profile.baked.sampleAtLevel(sourceS, sourceL, level)
    : sampleGroundMap(s, sourceL, profile, cliffSection);
}
