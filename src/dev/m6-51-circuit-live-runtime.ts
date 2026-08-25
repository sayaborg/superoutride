import { compileRasterPath } from '../core/course.js';
import { createM2StadiumGuide } from '../core/debug-course.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { compileCircuitTopology } from '../gameplay/circuit-topology.js';
import { compileCourseMode } from '../gameplay/course-mode.js';
import { SurfaceMap } from '../physics/surface-map.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../runtime/circuit-live-runtime.js';
import { GROUND_COLORS } from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';

export const M6_51_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_CIRCUIT_THREE_LAP_SOLO',
  routeKind: 'CIRCUIT',
  rivalCount: 0,
});

/**
 * Create a three-lap drivable circuit from the familiar M2 stadium authoring.
 *
 * The old stadium source is open and deliberately omits its closing chord. CIRCUIT
 * authoring closes it explicitly by appending exactly one copy of the first Raster
 * vertex, then M6.48 validates that seam as an ordinary unfolded interior turn.
 */
export function createM651CircuitLiveRuntime(): CircuitLiveRuntime {
  const openStadium = createM2StadiumGuide().raster;
  const first = openStadium.vertices[0];
  if (!first) throw new Error('M6.51 stadium source is empty');
  const lapRaster = compileRasterPath([
    ...openStadium.vertices.map((vertex) => ({ ...vertex })),
    { ...first },
  ]);
  const topology = compileCircuitTopology('DEV_STADIUM_CIRCUIT', lapRaster);
  const lapLength = topology.lapLength;

  const height = new HeightProfile(lapLength, [
    { s: 0, y: 0 },
    { s: lapLength, y: 0 },
  ]);
  const visual = new VisualProfile(lapLength, [{
    sStart: 0,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    name: 'M6.51 CIRCUIT STADIUM',
  }]);
  const surface = new SurfaceMap(lapLength, [{
    sStart: 0,
    name: 'M6.51 CIRCUIT SURFACE',
    bands: [
      { lMin: -12, lMax: -5.5, type: 'GRASS' },
      { lMin: -5.5, lMax: -4.5, type: 'SHOULDER' },
      { lMin: -4.5, lMax: 4.5, type: 'ASPHALT' },
      { lMin: 4.5, lMax: 5.5, type: 'SHOULDER' },
      { lMin: 5.5, lMax: 12, type: 'GRASS' },
    ],
  }]);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: 12,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV_STADIUM_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
