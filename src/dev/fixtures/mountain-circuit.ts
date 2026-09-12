import { HeightProfile } from '../../core/height-profile.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../../core/presentation-scale.js';
import { compileRasterPath, type RasterPath } from '../../core/raster-path.js';
import { RasterTurtle } from '../../course/raster-turtle.js';
import { compileCircuitTopology } from '../../gameplay/circuit-topology.js';
import { GROUND_COLORS } from '../../groundmap/ground-map.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../../runtime/circuit-live-runtime.js';
import { VisualProfile } from '../../visual/visual-profile.js';
import { createHighwaySurfaceMap, HIGHWAY_GROUND_HALF_WIDTH_METERS } from '../courses/highway-calibration.js';

const LOW_RADIUS_METERS = 95;
const HAIRPIN_RADIUS_METERS = 150;
const LOW_MEDIUM_RADIUS_METERS = 135;
const MEDIUM_RADIUS_METERS = 180;
const FLOWING_MEDIUM_RADIUS_METERS = 240;

interface LowMidSpeedMountainCircuitLap {
  readonly raster: RasterPath;
}

/**
 * Explicit CIRCUIT-only closed-lap authoring.
 *
 * Each side uses the same four balanced left/right complexes and one tight 180-degree end curve.
 * Repeating the side in the opposite world direction cancels displacement exactly. Tight radii
 * and short connectors create drift opportunities through ordinary tire forces; no section mode
 * or handling override exists.
 */
export function createLowMidSpeedMountainCircuitLap(): LowMidSpeedMountainCircuitLap {
  const turtle = new RasterTurtle({ x: 0, z: 0, sourceRadius: HAIRPIN_RADIUS_METERS });
  const { vertices } = turtle;
  const appendStraight = (length: number) => turtle.appendStraight(length);
  const appendArc = (radius: number, turn: number) => turtle.appendArc(radius, turn);

  const appendBalancedComplex = (radius: number, firstSign: -1 | 1, angleDegrees: number): void => {
    const angle = (angleDegrees * Math.PI) / 180;
    appendArc(radius, firstSign * angle);
    appendArc(radius, -firstSign * 2 * angle);
    appendArc(radius, firstSign * angle);
  };

  const appendSide = (): void => {
    appendStraight(300);
    appendBalancedComplex(MEDIUM_RADIUS_METERS, -1, 45);
    appendStraight(120);
    appendBalancedComplex(LOW_RADIUS_METERS, 1, 55);
    appendStraight(120);
    appendBalancedComplex(FLOWING_MEDIUM_RADIUS_METERS, -1, 35);
    appendStraight(100);
    appendBalancedComplex(LOW_MEDIUM_RADIUS_METERS, 1, 50);
    appendStraight(440);
  };

  appendSide();
  appendArc(HAIRPIN_RADIUS_METERS, Math.PI);
  appendSide();
  appendArc(HAIRPIN_RADIUS_METERS, Math.PI);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('low/mid-speed mountain circuit authoring failed to close');
  }
  vertices[vertices.length - 1] = { ...vertices.at(-1)!, x: 0, z: 0, sourceRadius: vertices[0]!.sourceRadius };

  const raster = compileRasterPath(vertices);
  return Object.freeze({ raster });
}

function createMountainHeightProfile(courseLength: number): HeightProfile {
  const broadShape = [
    { ratio: 0, y: 0 },
    { ratio: 0.08, y: 42 },
    { ratio: 0.18, y: -18 },
    { ratio: 0.28, y: 55 },
    { ratio: 0.38, y: -28 },
    { ratio: 0.475, y: 20 },
    { ratio: 0.5, y: 0 },
    { ratio: 0.58, y: -42 },
    { ratio: 0.68, y: 18 },
    { ratio: 0.78, y: -50 },
    { ratio: 0.88, y: 28 },
    { ratio: 0.975, y: -15 },
    { ratio: 1, y: 0 },
  ] as const;
  return new HeightProfile(
    courseLength,
    broadShape.map((node) => ({
      s: node.ratio * courseLength,
      y: node.y,
    })),
  );
}

export function createLowMidSpeedMountainCircuitRuntime(): CircuitLiveRuntime {
  const authored = createLowMidSpeedMountainCircuitLap();
  const topology = compileCircuitTopology('DEV__1_LOW_MID_SPEED_MOUNTAIN_CIRCUIT', authored.raster);
  const lapLength = topology.lapLength;
  const height = createMountainHeightProfile(lapLength);
  const visual = new VisualProfile(lapLength, [
    {
      sStart: 0,
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
      name: 'LOW/MID-SPEED MOUNTAIN CIRCUIT',
    },
  ]);
  const surface = createHighwaySurfaceMap(lapLength);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: HIGHWAY_GROUND_HALF_WIDTH_METERS + 1,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV__1_LOW_MID_SPEED_MOUNTAIN_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
