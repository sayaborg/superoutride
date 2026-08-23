import { rgba } from '../render/software-surface.js';

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
}

export function sampleGroundMap(s: number, l: number, profile: GroundMapProfile, cliffSection: boolean): number {
  const abs = Math.abs(l);
  if (abs <= 0.07 && ((s % 12) + 12) % 12 < 7) return GROUND_COLORS.marking;
  if (l >= -profile.roadLeft && l <= profile.roadRight) {
    return Math.floor(s * 0.25) & 1 ? GROUND_COLORS.asphaltA : GROUND_COLORS.asphaltB;
  }
  const leftShoulder = l >= -profile.roadLeft - profile.shoulderWidth && l < -profile.roadLeft;
  const rightShoulder = l > profile.roadRight && l <= profile.roadRight + profile.shoulderWidth;
  if (leftShoulder || rightShoulder) return GROUND_COLORS.shoulder;
  const checker = (Math.floor(s / 3) + Math.floor(Math.abs(l) / 2)) & 1;
  if (cliffSection && l < 0) return checker ? GROUND_COLORS.rockA : GROUND_COLORS.rockB;
  return checker ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
}
