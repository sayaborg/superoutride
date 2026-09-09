import type { GroundMapLogicalProfileReader, GroundMapLogicalSection } from '../compiler/surface-region-compiler.js';
import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import { rgba } from '../render/software-surface.js';
import type { BakedGroundMapReader } from './baked-ground-map.js';

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

export interface LongitudinalRoadMarking {
  readonly centerL: number;
  readonly width: number;
  readonly pattern: 'SOLID' | 'DASHED';
  readonly dashLength?: number;
  readonly gapLength?: number;
  readonly phaseS?: number;
}

export interface GroundMapProfile {
  groundLeft: number;
  groundRight: number;
  roadLeft: number;
  roadRight: number;
  shoulderWidth: number;
  /** Explicit longitudinal paint. Omission means no paint. */
  roadMarkings?: readonly LongitudinalRoadMarking[];
  /** Paint repeated about each junction carriageway center; omission means no paint. */
  junctionMarkings?: readonly LongitudinalRoadMarking[];
  /** Source-coordinate road center; zero is the unshifted coordinate basis. */
  roadCenterL?: number;
  /** Optional source chainage phase. Used when a stage-local s ruler is rebased onto reusable visual authoring. */
  chainageOffsetS?: number;
  /** Optional source-coordinate continuous road cross-section used by compiler bake and reusable source sampling. */
  junction?: JunctionCrossSectionProfile;
  /** Optional active-stage-local junction overlay. Only stage-local GroundMap adapters consume this field. */
  stageJunction?: JunctionCrossSectionProfile;
  /** Compiler output over the finite source domain. */
  logical?: GroundMapLogicalProfileReader;
  /** Compiler-baked runtime source over the same finite domain. */
  baked?: BakedGroundMapReader;
}

/** Procedural authoring/source reference retained for compiler bake and equivalence tests. */
export function sampleGroundMap(s: number, l: number, profile: GroundMapProfile): number {
  const sourceS = s + (profile.chainageOffsetS ?? 0);
  const checker = checkerAt(sourceS, l);
  if (profile.junction && profile.junction.sample(sourceS).phase !== 'SINGLE') {
    const junctionColor = sampleJunctionGroundMap(sourceS, l, profile.junction, profile.junctionMarkings, sourceS);
    if (junctionColor !== null) return junctionColor;
  } else {
    const roadCenterL = profile.roadCenterL ?? 0;
    const localL = l - roadCenterL;
    if (sampleRoadMarking(sourceS, localL, profile.roadMarkings)) return GROUND_COLORS.marking;
    if (localL >= -profile.roadLeft && localL <= profile.roadRight) return asphaltColor(sourceS);
    const leftShoulder = localL >= -profile.roadLeft - profile.shoulderWidth && localL < -profile.roadLeft;
    const rightShoulder = localL > profile.roadRight && localL <= profile.roadRight + profile.shoulderWidth;
    if (leftShoulder || rightShoulder) return GROUND_COLORS.shoulder;
  }

  const logical = profile.logical?.sample(sourceS);
  if (logical) return sampleOuterMaterial(logical, l - (profile.roadCenterL ?? 0), checker);
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
  markings: readonly LongitudinalRoadMarking[] | undefined,
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
    const center = lateralClass === 'ASPHALT_SINGLE'
      ? 0
      : junction.childCenterLAt(junctionS, lateralClass === 'ASPHALT_LEFT' ? 'LEFT' : 'RIGHT');
    if (center !== null && sampleRoadMarking(patternS, l - center, markings)) return GROUND_COLORS.marking;
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

function sampleRoadMarking(
  s: number,
  localL: number,
  markings: readonly LongitudinalRoadMarking[] | undefined,
): boolean {
  if (!markings) return false;

  for (const marking of markings) {
    if (!(marking.width > 0) || !Number.isFinite(marking.width) || !Number.isFinite(marking.centerL)) {
      throw new RangeError('road marking position and width must be finite, with width > 0');
    }
    if (Math.abs(localL - marking.centerL) > marking.width * 0.5) continue;
    if (marking.pattern === 'SOLID') return true;

    const dashLength = marking.dashLength;
    const gapLength = marking.gapLength;
    if (!(dashLength !== undefined && dashLength > 0 && Number.isFinite(dashLength))) {
      throw new RangeError('dashed road marking dashLength must be finite and > 0');
    }
    if (!(gapLength !== undefined && gapLength > 0 && Number.isFinite(gapLength))) {
      throw new RangeError('dashed road marking gapLength must be finite and > 0');
    }
    const localS = s + (marking.phaseS ?? 0);
    if (dashPatternOn(localS, dashLength, gapLength)) return true;
  }
  return false;
}

function dashPatternOn(s: number, dashLength: number, gapLength: number): boolean {
  const period = dashLength + gapLength;
  return ((s % period) + period) % period < dashLength;
}

function sampleOuterMaterial(section: GroundMapLogicalSection, l: number, checker: number): number {
  const material = l < 0 ? section.left : section.right;
  if (material === 'ROCK') return checker ? GROUND_COLORS.rockA : GROUND_COLORS.rockB;
  return checker ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
}
