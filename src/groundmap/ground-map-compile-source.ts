import { positiveFinite } from '../core/validation.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import { sampleGroundMap, type GroundMapProfile } from './ground-map.js';
import { sampleStageGroundMapAtLevel } from './stage-ground-map-view.js';

/** Final point-sampled colors on one finite local rectangle. Inputs must stay immutable during compilation. */
export interface GroundMapCompileSource {
  readonly courseLength: number;
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly sample: (s: number, l: number) => number;
}

/** Reuse current paint precedence and source transforms; the output asset needs neither at runtime. */
export function createGroundMapCompileSource(
  courseLength: number,
  profile: GroundMapProfile,
  view: StageRoadView | null = null,
): GroundMapCompileSource {
  positiveFinite(courseLength, 'GroundMap source length');
  if (profile.baked) throw new Error('GroundMap compilation requires source paint, not a baked reader');
  const { groundLeft, groundRight } = view ?? profile;
  positiveFinite(groundLeft, 'GroundMap source groundLeft');
  positiveFinite(groundRight, 'GroundMap source groundRight');
  const evaluate = view
    ? (s: number, l: number) => sampleStageGroundMapAtLevel(s, l, 0, view, profile)
    : (s: number, l: number) => sampleGroundMap(s, l, profile);
  return Object.freeze({
    courseLength,
    groundLeft,
    groundRight,
    sample(s: number, l: number): number {
      if (!Number.isFinite(s) || !Number.isFinite(l) || s < 0 || s > courseLength || l < -groundLeft || l > groundRight)
        throw new RangeError('GroundMap source sample outside finite local rectangle');
      return evaluate(s, l);
    },
  });
}
