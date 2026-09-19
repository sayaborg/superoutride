import { rgba } from '../../graphics/software-surface.js';

/** Fixed color inputs for the retained projection/framebuffer oracle. */
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

export interface ReferencePaintProfile {
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly road: { readonly roadLeft: number; readonly roadRight: number; readonly shoulderWidth: number };
  readonly roadMarkings?: readonly {
    readonly centerL: number;
    readonly width: number;
    readonly pattern: 'SOLID' | 'DASHED';
    readonly dashLength?: number;
    readonly gapLength?: number;
    readonly phaseS?: number;
  }[];
}

export const CENTER_DASH_MARKINGS = Object.freeze([
  Object.freeze({ centerL: 0, width: 0.14, pattern: 'DASHED' as const, dashLength: 7, gapLength: 5 }),
]);

export function sampleReferencePaint(s: number, l: number, profile: ReferencePaintProfile): number {
  for (const marking of profile.roadMarkings ?? []) {
    if (Math.abs(l - marking.centerL) > marking.width * 0.5) continue;
    if (marking.pattern === 'SOLID') return GROUND_COLORS.marking;
    const period = marking.dashLength! + marking.gapLength!;
    const local = s + (marking.phaseS ?? 0);
    if (((local % period) + period) % period < marking.dashLength!) return GROUND_COLORS.marking;
  }
  const { roadLeft, roadRight, shoulderWidth } = profile.road;
  if (l >= -roadLeft && l <= roadRight)
    return Math.floor(s * 0.25) & 1 ? GROUND_COLORS.asphaltA : GROUND_COLORS.asphaltB;
  if (l >= -roadLeft - shoulderWidth && l <= roadRight + shoulderWidth) return GROUND_COLORS.shoulder;
  return (Math.floor(s / 3) + Math.floor(Math.abs(l) / 2)) & 1 ? GROUND_COLORS.grassA : GROUND_COLORS.grassB;
}
