import { compileGuidePath } from '../../core/guide-curve.js';
import { HeightProfile } from '../../core/height-profile.js';
import { compileRasterPath } from '../../core/raster-path.js';
import { RECOVERY_PROFILE } from '../../gameplay/recovery.js';
import { SurfaceMap } from '../../physics/surface-map.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import { GROUND_COLORS } from './reference-paint.js';

export const STRAIGHT_RECOVERY_PROFILE = Object.freeze({ ...RECOVERY_PROFILE, targetL: -1.75 });

/** One segment and fixed material/height inputs retained by mechanics, audio and sprite oracles. */
export function createStraightReferenceWorld() {
  const guide = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 8000 },
    ]),
    { lMax: 13, mMin: 0.25, dCam: 5 },
  );
  const heightProfile = new HeightProfile(guide.length, [
    { s: 0, y: 0 },
    { s: 800, y: 0 },
    { s: 1600, y: 16 },
    { s: 2500, y: -10 },
    { s: 3500, y: 24 },
    { s: 4600, y: 0 },
    { s: 5500, y: -14 },
    { s: 6500, y: 18 },
    { s: 7300, y: 0 },
    { s: 8000, y: 0 },
  ]);
  const surfaceMap = new SurfaceMap(guide.length, [
    {
      sStart: 0,
      name: 'FOUR-LANE HIGHWAY CALIBRATION SURFACE',
      bands: [
        { lMin: -12, lMax: -8.5, type: 'GRASS' },
        { lMin: -8.5, lMax: -7, type: 'SHOULDER' },
        { lMin: -7, lMax: 7, type: 'ASPHALT' },
        { lMin: 7, lMax: 8.5, type: 'SHOULDER' },
        { lMin: 8.5, lMax: 12, type: 'GRASS' },
      ],
    },
  ]);
  const visualProfile = new VisualProfile(guide.length, [
    {
      sStart: 0,
      name: 'OPEN EIGHT KILOMETER HIGHWAY',
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    },
  ]);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    road: { roadLeft: 7, roadRight: 7, shoulderWidth: 1.5 },
    roadMarkings: [
      { centerL: -7, width: 0.2, pattern: 'SOLID' as const },
      ...[-3.5, 0, 3.5].map((centerL) => ({
        centerL,
        width: 0.15,
        pattern: 'DASHED' as const,
        dashLength: 8,
        gapLength: 12,
      })),
      { centerL: 7, width: 0.2, pattern: 'SOLID' as const },
    ],
  };
  const terrainProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 200,
    groundLeft: 12,
    groundRight: 12,
    height: heightProfile,
    visual: visualProfile,
  };
  return { guide, heightProfile, surfaceMap, visualProfile, groundProfile, terrainProfile };
}
