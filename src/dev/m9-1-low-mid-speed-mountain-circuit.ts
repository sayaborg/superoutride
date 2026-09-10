import { RasterTurtle } from '../course/raster-turtle.js';
import { compileRasterPath, type RasterPath } from '../core/course.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { compileCircuitTopology } from '../gameplay/circuit-topology.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../runtime/circuit-live-runtime.js';
import { GROUND_COLORS } from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import { M7_1_GROUND_HALF_WIDTH_METERS, createM71HighwaySurfaceMap } from './m7-1-highway-calibration-course.js';

const LOW_RADIUS_METERS = 95;
const HAIRPIN_RADIUS_METERS = 150;
const LOW_MEDIUM_RADIUS_METERS = 135;
const MEDIUM_RADIUS_METERS = 180;
const FLOWING_MEDIUM_RADIUS_METERS = 240;

export interface M91LowMidSpeedMountainCircuitLap {
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
export function createM91LowMidSpeedMountainCircuitLap(): M91LowMidSpeedMountainCircuitLap {
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
    throw new Error('M9.1 low/mid-speed mountain circuit authoring failed to close');
  }
  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;

  const raster = compileRasterPath(vertices);
  return Object.freeze({ raster });
}

function createM91MountainHeightProfile(courseLength: number): HeightProfile {
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

export function createM91LowMidSpeedMountainCircuitRuntime(): CircuitLiveRuntime {
  const authored = createM91LowMidSpeedMountainCircuitLap();
  const topology = compileCircuitTopology('DEV_M9_1_LOW_MID_SPEED_MOUNTAIN_CIRCUIT', authored.raster);
  const lapLength = topology.lapLength;
  const height = createM91MountainHeightProfile(lapLength);
  const visual = new VisualProfile(lapLength, [
    {
      sStart: 0,
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
      name: 'M9.1 LOW/MID-SPEED MOUNTAIN CIRCUIT',
    },
  ]);
  const surface = createM71HighwaySurfaceMap(lapLength);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: M7_1_GROUND_HALF_WIDTH_METERS + 1,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV_M9_1_LOW_MID_SPEED_MOUNTAIN_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
