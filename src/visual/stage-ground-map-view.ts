import { stageRoadSourceLateral, type StageRoadView } from '../course/stage-road-view.js';
import type { BakedGroundMapSample } from './baked-ground-map.js';
import {
  sampleGroundMap,
  type GroundMapProfile,
} from './ground-map.js';

/**
 * Stage-local GroundMap sampling without duplicating the baked parent asset.
 *
 * local l is translated once into the parent-authored source lateral coordinate. The runtime LOD
 * remains chainage-only and therefore unchanged by the stage view.
 */
export function sampleStageGroundMapRuntime(
  s: number,
  localL: number,
  deltaSEffective: number,
  view: StageRoadView,
  profile: GroundMapProfile,
  cliffSection = false,
): BakedGroundMapSample {
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
  const sourceL = stageRoadSourceLateral(view, localL);
  return profile.baked
    ? profile.baked.sampleAtLevel(s, sourceL, level)
    : sampleGroundMap(s, sourceL, profile, cliffSection);
}
