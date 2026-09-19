import { compileRasterPath } from '../../dist/core/raster-path.js';
import { compileGuidePath } from '../../dist/core/guide-curve.js';
import { HeightProfile } from '../../dist/core/height-profile.js';
import { SurfaceMap } from '../../dist/physics/surface-map.js';
import { compileCircuitRaceRules } from '../../dist/gameplay/circuit-race-progress.js';

/** Explicit coincident geometry solely for seeded-projection and ordered-gate regressions. */
export function repeatedGuideFixture(topology, startWinding, repeatCount, options) {
  const vertices = Array.from({ length: repeatCount }, () => topology.lapPath.vertices.slice(0, -1)).flat();
  vertices.push(topology.lapPath.vertices.at(-1));
  const guide = compileGuidePath(compileRasterPath(vertices), options);
  return { topology, startWinding, repeatCount, guide, length: guide.length };
}

export function createRepeatedReferenceWorld() {
  const vertices = Array.from({ length: 72 }, (_, i) => ({
    x: 120 * Math.cos((i / 72) * Math.PI * 2),
    z: 120 * Math.sin((i / 72) * Math.PI * 2),
  }));
  vertices.push({ ...vertices[0] });
  const lapPath = compileRasterPath(vertices),
    topology = { id: 'repeated-fixture', lapPath, lapLength: lapPath.length };
  const window = repeatedGuideFixture(topology, 0, 4, { lMax: 13, mMin: 0.25, dCam: 5 });
  window.height = new HeightProfile(window.length, [
    { s: 0, y: 0 },
    { s: window.length, y: 0 },
  ]);
  window.surface = new SurfaceMap(window.length, [
    { sStart: 0, name: 'projection fixture', bands: [{ lMin: -12, lMax: 12, type: 'ASPHALT' }] },
  ]);
  const raceRules = compileCircuitRaceRules(window, {
    id: 'ordered-fixture',
    lapCount: 3,
    checkpointChainages: [topology.lapLength / 2],
  });
  return { window, raceRules };
}
