import { compileGuidePath } from '../../core/guide-curve.js';
import { HeightProfile } from '../../core/height-profile.js';
import { compileRasterPath } from '../../core/raster-path.js';
import { RasterTurtle } from '../../course/raster-turtle.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import { SurfaceMap } from '../../physics/surface-map.js';
import { createStraightReferenceWorld } from './straight-world.js';

/** The finite curve/crest neighborhood used by mechanics and render-height regressions. */
export function createCurvedReferenceWorld() {
  const turtle = new RasterTurtle({ x: 0, z: 0, sourceRadius: 470 });
  turtle.appendStraight(700);
  turtle.appendArc(720, (-20 * Math.PI) / 180);
  turtle.appendArc(720, (40 * Math.PI) / 180);
  turtle.appendArc(720, (-20 * Math.PI) / 180);
  turtle.appendStraight(700);
  turtle.appendArc(470, Math.PI);
  const guide = compileGuidePath(compileRasterPath(turtle.vertices), { lMax: 20, mMin: 0.25, dCam: 5 });
  const reference = createStraightReferenceWorld();
  const heightProfile = new HeightProfile(guide.length, [
    { s: 0, y: 0 },
    { s: 100, y: 0 },
    { s: 700, y: 0 },
    { s: 1400, y: 12 },
    { s: 2100, y: -8 },
    { s: 3000, y: 24 },
    { s: 3800, y: 0 },
    { s: guide.length, y: 0 },
  ]);
  const surfaceMap = new SurfaceMap(guide.length, reference.surfaceMap.sections);
  const visualProfile = new VisualProfile(guide.length, reference.visualProfile.sections);
  const groundProfile = { ...reference.groundProfile, groundLeft: 13, groundRight: 13 };
  const terrainProfile = {
    ...reference.terrainProfile,
    groundLeft: 13,
    groundRight: 13,
    height: heightProfile,
    visual: visualProfile,
  };
  return { guide, heightProfile, surfaceMap, visualProfile, groundProfile, terrainProfile };
}

/** Only the straight, gently rising first 240 m needed by the permitted wheel-lift trace. */
export function createRisingReferenceWorld() {
  const guide = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 240 },
    ]),
    { lMax: 13, mMin: 0.25, dCam: 5 },
  );
  const height = new HeightProfile(240, [
    { s: 0, y: 0 },
    { s: 240, y: 1.6 },
  ]);
  const surface = new SurfaceMap(240, [
    { sStart: 0, name: 'ASPHALT', bands: [{ lMin: -12, lMax: 12, type: 'ASPHALT' }] },
  ]);
  return { guide, height, surface };
}
