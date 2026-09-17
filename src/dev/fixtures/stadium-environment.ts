import { rgba } from '../../graphics/software-surface.js';
import { GroundMapLogicalProfile } from '../../groundmap/logical-profile.js';
import { roadSurfaceBands } from '../../physics/road-surface-bands.js';
import type { SurfaceSection, SurfaceBand } from '../../physics/surface-map.js';
import type { VisualSection } from '../../visual/visual-profile.js';
import { STADIUM_ROAD_CROSS_SECTION } from '../courses/stadium-junction.js';

export const STADIUM_SURFACE_BASE_COLORS = {
  grass: rgba(45, 100, 53),
  rock: rgba(83, 74, 61),
} as const;

/** Regression fixture composition: each attribute owns its independent change points. */
export function createStadiumEnvironment(courseLength: number) {
  if (!(courseLength > 1) || !Number.isFinite(courseLength))
    throw new RangeError('fixture course length must be finite and > 1');
  const grass = { kind: 'color' as const, color: STADIUM_SURFACE_BASE_COLORS.grass };
  const rock = { kind: 'color' as const, color: STADIUM_SURFACE_BASE_COLORS.rock };
  const returnStart = Math.min(625, courseLength - 1);
  // Return to grass only after the cliff; shorter fixtures end in their current section.
  const hasReturn = returnStart > 455;
  const groundMap = new GroundMapLogicalProfile(courseLength, [
    { sStart: 0, name: 'GRASSLAND', left: 'GRASS' as const, right: 'GRASS' as const },
    ...(455 < courseLength
      ? [{ sStart: 455, name: 'CLIFF / SEA', left: 'ROCK' as const, right: 'GRASS' as const }]
      : []),
    ...(hasReturn ? [{ sStart: returnStart, name: 'GRASSLAND', left: 'GRASS' as const, right: 'GRASS' as const }] : []),
  ]);
  const visualSections: VisualSection[] = [
    { sStart: 0, name: 'GRASSLAND', groundBaseLeft: grass, groundBaseRight: grass },
    ...(455 < courseLength
      ? [{ sStart: 455, name: 'CLIFF / SEA', groundBaseLeft: { kind: 'transparent' as const }, groundBaseRight: rock }]
      : []),
    ...(hasReturn ? [{ sStart: returnStart, name: 'GRASSLAND', groundBaseLeft: grass, groundBaseRight: grass }] : []),
  ];
  const surfaceSections: SurfaceSection[] = [
    { sStart: 0, name: 'GRASSLAND', bands: bands('GRASS', 'GRASS') },
    { sStart: 280, name: 'SAND PATCH', bands: bands('GRASS', 'SAND') },
    { sStart: 360, name: 'DIRT PATCH', bands: bands('DIRT', 'GRASS') },
    { sStart: 455, name: 'CLIFF / SEA', bands: bands('DIRT', 'GRASS', 6.5) },
    ...(hasReturn ? [{ sStart: returnStart, name: 'GRASSLAND', bands: bands('GRASS', 'GRASS') }] : []),
  ].filter((section) => section.sStart < courseLength);
  return { groundMap, visualSections, surfaceSections };
}

function bands(leftType: SurfaceBand['type'], rightType: SurfaceBand['type'], left = 10.5) {
  return roadSurfaceBands(STADIUM_ROAD_CROSS_SECTION, { left, right: 10.5, leftType, rightType });
}
