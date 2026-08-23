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
 * Stage-local GroundMap sampling without duplicating the baked parent asset.
 *
 * ROAD/TERRAIN translate local l once into the parent-authored source coordinate. SHOULDER is a
 * stage-local semantic override, so the median-facing edge of a committed child becomes a normal
 * shoulder. Runtime LOD remains chainage-only and is unchanged by this lateral view.
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
  if (profile.baked) return profile.baked.sample(s, sourceL, deltaSEffective);
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
  return profile.baked
    ? profile.baked.sampleAtLevel(s, sourceL, level)
    : sampleGroundMap(s, sourceL, profile, cliffSection);
}
