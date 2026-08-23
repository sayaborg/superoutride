import { rgba } from '../render/software-surface.js';
import { CyclicVisualProfile } from './visual-profile.js';

export const M3_BASE_COLORS = {
  grass: rgba(45, 100, 53),
  rock: rgba(83, 74, 61),
} as const;

export function createM3DebugVisualProfile(courseLength: number): CyclicVisualProfile {
  const points = [
    { sStart: 0, name: 'GRASSLAND', left: 'color' as const },
    { sStart: 455, name: 'CLIFF / SEA', left: 'transparent' as const },
    { sStart: Math.min(625, courseLength - 1), name: 'GRASSLAND', left: 'color' as const },
  ].filter((point, index, array) => point.sStart < courseLength && (index === 0 || point.sStart > array[index - 1]!.sStart));

  return new CyclicVisualProfile(courseLength, points.map((point) => ({
    sStart: point.sStart,
    name: point.name,
    groundBaseLeft: point.left === 'transparent'
      ? { kind: 'transparent' as const }
      : { kind: 'color' as const, color: M3_BASE_COLORS.grass },
    groundBaseRight: { kind: 'color' as const, color: point.name.startsWith('CLIFF') ? M3_BASE_COLORS.rock : M3_BASE_COLORS.grass },
  })));
}
