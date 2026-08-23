import {
  classifyStageRoadLocalL,
  stageRoadSourceLateral,
  type StageRoadView,
} from '../course/stage-road-view.js';
import type { BakedGroundMapSample } from './baked-ground-map.js';
import {
  GROUND_COLORS,
  sampleGroundMapWithoutJunction,
  sampleJunctionGroundMap,
  type GroundMapProfile,
} from './ground-map.js';

/**
 * Stage-local GroundMap sampling without duplicating reusable source data.
 *
 * A stage-local junction, when present, is classified before the fixed single-road StageRoadView.
 * This lets an ordinary successor road widen and split while keeping its junction centered at local
 * l=0 even when the underlying Raster source has a non-zero lateral origin. Outside the junction,
 * ROAD/TERRAIN still translate local l once into the reusable source coordinate and SHOULDER keeps
 * its existing stage-local semantic override.
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
  if (profile.junction) {
    const junctionColor = sampleJunctionGroundMap(s, localL, profile.junction, sourceS);
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
    color: sampleGroundMapWithoutJunction(s, sourceL, profile, cliffSection),
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
  if (profile.junction) {
    const junctionColor = sampleJunctionGroundMap(s, localL, profile.junction, sourceS);
    if (junctionColor !== null) return junctionColor;
  }

  if (localClass === 'SHOULDER') return GROUND_COLORS.shoulder;

  const sourceL = stageRoadSourceLateral(view, localL);
  return profile.baked
    ? profile.baked.sampleAtLevel(sourceS, sourceL, level)
    : sampleGroundMapWithoutJunction(s, sourceL, profile, cliffSection);
}
