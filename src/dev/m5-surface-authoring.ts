import type { AuthoredSurfaceBand, AuthoredSurfaceType, SurfaceRegionAuthoring } from '../course/surface-region.js';
import { rgba } from '../render/software-surface.js';

export const M5_SURFACE_BASE_COLORS = {
  grass: rgba(45, 100, 53),
  rock: rgba(83, 74, 61),
} as const;

export function createM5DebugSurfaceRegionAuthoring(courseLength: number): SurfaceRegionAuthoring[] {
  if (!(courseLength > 1)) throw new RangeError('debug course length must be > 1');
  const starts = [
    { sStart: 0, name: 'GRASSLAND', left: 'GRASS' as AuthoredSurfaceType, right: 'GRASS' as AuthoredSurfaceType },
    { sStart: 280, name: 'SAND PATCH', left: 'GRASS' as AuthoredSurfaceType, right: 'SAND' as AuthoredSurfaceType },
    { sStart: 360, name: 'DIRT PATCH', left: 'DIRT' as AuthoredSurfaceType, right: 'GRASS' as AuthoredSurfaceType },
    { sStart: 455, name: 'CLIFF / SEA', left: null, right: 'GRASS' as AuthoredSurfaceType },
    { sStart: Math.min(625, courseLength - 1), name: 'GRASSLAND', left: 'GRASS' as AuthoredSurfaceType, right: 'GRASS' as AuthoredSurfaceType },
  ].filter((entry, index, array) => entry.sStart < courseLength && (index === 0 || entry.sStart > array[index - 1]!.sStart));

  return starts.map((entry) => {
    const cliff = entry.name === 'CLIFF / SEA';
    return {
      sStart: entry.sStart,
      name: entry.name,
      groundMapLeft: cliff ? 'ROCK' : 'GRASS',
      groundMapRight: 'GRASS',
      groundBaseLeft: cliff
        ? { kind: 'transparent' as const }
        : { kind: 'color' as const, color: M5_SURFACE_BASE_COLORS.grass },
      groundBaseRight: {
        kind: 'color' as const,
        color: cliff ? M5_SURFACE_BASE_COLORS.rock : M5_SURFACE_BASE_COLORS.grass,
      },
      surfaceBands: cliff ? cliffBands() : standardBands(entry.left!, entry.right),
    };
  });
}

function standardBands(
  leftOuter: AuthoredSurfaceType,
  rightOuter: AuthoredSurfaceType,
  roadLeft = 4.5,
  roadRight = 4.5,
  shoulderWidth = 1,
  outerLimit = 10.5,
): AuthoredSurfaceBand[] {
  return [
    { lMin: -outerLimit, lMax: -(roadLeft + shoulderWidth), type: leftOuter },
    { lMin: -(roadLeft + shoulderWidth), lMax: -roadLeft, type: 'SHOULDER' },
    { lMin: -roadLeft, lMax: roadRight, type: 'ASPHALT' },
    { lMin: roadRight, lMax: roadRight + shoulderWidth, type: 'SHOULDER' },
    { lMin: roadRight + shoulderWidth, lMax: outerLimit, type: rightOuter },
  ];
}

function cliffBands(): AuthoredSurfaceBand[] {
  return [
    { lMin: -6.5, lMax: -5.5, type: 'DIRT' },
    { lMin: -5.5, lMax: -4.5, type: 'SHOULDER' },
    { lMin: -4.5, lMax: 4.5, type: 'ASPHALT' },
    { lMin: 4.5, lMax: 5.5, type: 'SHOULDER' },
    { lMin: 5.5, lMax: 10.5, type: 'GRASS' },
  ];
}
