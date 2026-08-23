import {
  classifyStageRoadLocalL,
  stageRoadSourceLateral,
  type StageRoadView,
} from '../course/stage-road-view.js';
import type { BakedGroundMapSample } from './baked-ground-map.js';
import {
  GROUND_COLORS,
  sampleGroundMap,
  type GroundMapProfile,
} from './ground-map.js';

/**
 * Stage-local GroundMap sampling without duplicating reusable source data.
 *
 * ROAD/TERRAIN translate local l once into the authored source coordinate. SHOULDER is a
 * stage-local semantic override. An optional source chainage offset preserves longitudinal visual
 * phase when a stage handoff rebases the local s ruler; LOD authority itself remains chainage-only.
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
  if (localClass === 'SHOULDER') {
    return {
      color: GROUND_COLORS.shoulder,
      level: profile.baked?.selectLevel(deltaSEffective) ?? 0,
    };
  }

  const sourceL = stageRoadSourceLateral(view, localL);
  const sourceS = s + (profile.chainageOffsetS ?? 0);
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
  if (localClass === 'SHOULDER') return GROUND_COLORS.shoulder;

  const sourceL = stageRoadSourceLateral(view, localL);
  const sourceS = s + (profile.chainageOffsetS ?? 0);
  return profile.baked
    ? profile.baked.sampleAtLevel(sourceS, sourceL, level)
    : sampleGroundMap(s, sourceL, profile, cliffSection);
}
