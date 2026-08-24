import type { GroundMapLogicalProfileReader, GroundMapLogicalSection } from '../compiler/surface-region-compiler.js';
import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import { rgba } from '../render/software-surface.js';
import type { BakedGroundMapReader, BakedGroundMapSample } from './baked-ground-map.js';

export const GROUND_COLORS = {
  grassA: rgba(45, 100, 53),
  grassB: rgba(39, 88, 46),
  rockA: rgba(92, 83, 68),
  rockB: rgba(79, 70, 58),
  shoulder: rgba(154, 143, 111),
  asphaltA: rgba(78, 83, 88),
  asphaltB: rgba(70, 75, 80),
  marking: rgba(232, 229, 205),
} as const;

export interface GroundMapProfile {
  groundLeft: number;
  groundRight: number;
  roadLeft: number;
  roadRight: number;
  shoulderWidth: number;
  /** Optional source-coordinate road center. Default 0 keeps all pre-M6.22 authoring unchanged. */
  roadCenterL?: number;
  /** Optional source chainage phase. Used when a stage-local s ruler is rebased onto reusable visual authoring. */
  chainageOffsetS?: number;
  /** Optional source-coordinate continuous road cross-section used by compiler bake and reusable source sampling. */
  junction?: JunctionCrossSectionProfile;
  /** Optional active-stage-local junction overlay. Only stage-local GroundMap adapters consume this field. */
  stageJunction?: JunctionCrossSectionProfile;
  /** Compiler output. General form is open; explicit cyclic adapters satisfy the same reader contract. */
  logical?: GroundMapLogicalProfileReader;
  /** Compiler-baked runtime source. General form is open; cyclic addressing requires an explicit adapter. */
  baked?: BakedGroundMapReader;
}

export function sampleGroundMapRuntime(
  s: number,
  l: number,
  deltaSEffective: number,
  profile: GroundMapProfile,
  cliffSection = false,
): BakedGroundMapSample {
  const sourceS = s + (profile.chainageOffsetS ?? 0);
  if (profile.baked) return profile.baked.sample(sourceS, l, deltaSEffective);
  return {
    color: sampleGroundMap(s, l, profile, cliffSection),
    level: 0,
  };
}

/** Procedural authoring/source reference retained for compiler bake and equivalence tests. */
export function sampleGroundMap(s: number, l: number, profile: GroundMapProfile, cliffSection = false): number {
  const sourceS = s + (profile.chainageOffsetS ?? 0);
  const checker = checkerAt(sourceS, l);
  if (profile.junction) {
    const junctionColor = sampleJunctionGroundMap(sourceS, l, profile.junction, sourceS);
    if (junctionColor !== null) return junctionColor;
  } else {
    const roadCenterL = profile.roadCenterL ?? 0;
    const localL = l - roadCenterL;
    const abs = Math.abs(localL);
    if (abs <= 0.07 && isDashOn(sourceS)) return GROUND_COLORS.marking;
    if (localL >= -profile.roadLeft && localL <= profile.roadRight) return asphaltColor(sourceS);
    const leftShoulder = localL >= -profile.roadLeft - profile.shoulderWidth && localL < -profile.roadLeft;
    const rightShoulder = localL > profile.roadRight && localL <= profile.roadRight + profile.shoulderWidth;
    if (leftShoulder || rightShoulder) return GROUND_COLORS.shoulder;
  }

  const logical = profile.logical?.sample(sourceS);
  if (logical) return sampleOuterMaterial(logical, l - (profile.roadCenterL ?? 0), checker);
  if (cliffSection && l < (profile.roadCenterL ?? 0)) return checker ? GROUND_COLORS.rockA : GROUND_COLORS.rockB;
  return checker ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
}

/**
 * Procedural junction paint shared by source-coordinate and active-stage-local adapters.
 * `junctionS` selects cross-section geometry while `patternS` independently preserves visual phase.
 */
export function sampleJunctionGroundMap(
  junctionS: number,
  l: number,
  junction: JunctionCrossSectionProfile,
  patternS = junctionS,
): number | null {
  const checker = checkerAt(patternS, l);
  const lateralClass = junction.classify(junctionS, l);

  if (lateralClass === 'MEDIAN') return checker ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
  if (lateralClass === 'SHOULDER') return GROUND_COLORS.shoulder;
  if (
    lateralClass === 'ASPHALT_SINGLE'
    || lateralClass === 'ASPHALT_LEFT'
    || lateralClass === 'ASPHALT_RIGHT'
  ) {
    if (isDashOn(patternS)) {
      if (lateralClass === 'ASPHALT_SINGLE') {
        if (Math.abs(l) <= 0.07) return GROUND_COLORS.marking;
      } else {
        const side = lateralClass === 'ASPHALT_LEFT' ? 'LEFT' : 'RIGHT';
        const center = junction.childCenterLAt(junctionS, side);
        if (center !== null && Math.abs(l - center) <= 0.07) return GROUND_COLORS.marking;
      }
    }
    return asphaltColor(patternS);
  }

  return null;
}

function checkerAt(s: number, l: number): number {
  return (Math.floor(s / 3) + Math.floor(Math.abs(l) / 2)) & 1;
}

function asphaltColor(s: number): number {
  return Math.floor(s * 0.25) & 1 ? GROUND_COLORS.asphaltA : GROUND_COLORS.asphaltB;
}

function isDashOn(s: number): boolean {
  return ((s % 12) + 12) % 12 < 7;
}

function sampleOuterMaterial(section: GroundMapLogicalSection, l: number, checker: number): number {
  const material = l < 0 ? section.left : section.right;
  if (material === 'ROCK') return checker ? GROUND_COLORS.rockA : GROUND_COLORS.rockB;
  return checker ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
}
