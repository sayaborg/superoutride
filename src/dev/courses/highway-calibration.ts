import { HeightProfile } from '../../core/height-profile.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../../core/presentation-scale.js';
import { compileRasterPath, type RasterPath } from '../../core/raster-path.js';
import { RasterTurtle } from '../../course/raster-turtle.js';
import { compileCircuitTopology } from '../../gameplay/circuit-topology.js';
import { RECOVERY_PROFILE, type RecoveryProfile } from '../../gameplay/recovery.js';
import { GROUND_COLORS, type GroundMapProfile, type LongitudinalRoadMarking } from '../../groundmap/ground-map.js';
import { SurfaceMap } from '../../physics/surface-map.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../../runtime/circuit-live-runtime.js';
import { VisualProfile } from '../../visual/visual-profile.js';

export const HIGHWAY_LANE_COUNT = 4;
export const HIGHWAY_LANE_WIDTH_METERS = 3.5;
export const HIGHWAY_ROAD_HALF_WIDTH_METERS = HIGHWAY_LANE_COUNT * HIGHWAY_LANE_WIDTH_METERS * 0.5;
const HIGHWAY_SHOULDER_WIDTH_METERS = 1.5;
export const HIGHWAY_GROUND_HALF_WIDTH_METERS = 12;
export const HIGHWAY_PLAYER_START_L = -HIGHWAY_LANE_WIDTH_METERS * 0.5;
export const HIGHWAY_RIVAL_START_L = HIGHWAY_LANE_WIDTH_METERS * 0.5;

export const HIGHWAY_LANE_MARKING_WIDTH_METERS = 0.15;
export const HIGHWAY_EDGE_MARKING_WIDTH_METERS = 0.2;
export const HIGHWAY_MARKING_DASH_LENGTH_METERS = 8;
export const HIGHWAY_MARKING_GAP_LENGTH_METERS = 12;

const HIGHWAY_STANDARD_CURVE_RADIUS_METERS = 470;
const HIGHWAY_SWEEP_CURVE_RADIUS_METERS = 720;
export const HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS = 90;
export const HIGHWAY_LOW_SPEED_COMPLEX_COUNT = 2;
export const HIGHWAY_LOW_SPEED_CONNECTOR_LENGTH_METERS = 200;
export const HIGHWAY_AIRBORNE_PROBE_START_S = 250;

export const HIGHWAY_HIGHWAY_RECOVERY_PROFILE: Readonly<RecoveryProfile> = Object.freeze({
  ...RECOVERY_PROFILE,
  targetL: HIGHWAY_PLAYER_START_L,
});

export const HIGHWAY_HIGHWAY_RIVAL_RECOVERY_PROFILE: Readonly<RecoveryProfile> = Object.freeze({
  ...RECOVERY_PROFILE,
  targetL: HIGHWAY_RIVAL_START_L,
});

const HIGHWAY_MARKINGS: readonly LongitudinalRoadMarking[] = Object.freeze([
  Object.freeze({
    centerL: -HIGHWAY_ROAD_HALF_WIDTH_METERS,
    width: HIGHWAY_EDGE_MARKING_WIDTH_METERS,
    pattern: 'SOLID' as const,
  }),
  ...[-HIGHWAY_LANE_WIDTH_METERS, 0, HIGHWAY_LANE_WIDTH_METERS].map((centerL) =>
    Object.freeze({
      centerL,
      width: HIGHWAY_LANE_MARKING_WIDTH_METERS,
      pattern: 'DASHED' as const,
      dashLength: HIGHWAY_MARKING_DASH_LENGTH_METERS,
      gapLength: HIGHWAY_MARKING_GAP_LENGTH_METERS,
    }),
  ),
  Object.freeze({
    centerL: HIGHWAY_ROAD_HALF_WIDTH_METERS,
    width: HIGHWAY_EDGE_MARKING_WIDTH_METERS,
    pattern: 'SOLID' as const,
  }),
]);

export function createHighwayGroundProfile(): GroundMapProfile {
  return {
    groundLeft: HIGHWAY_GROUND_HALF_WIDTH_METERS,
    groundRight: HIGHWAY_GROUND_HALF_WIDTH_METERS,
    roadLeft: HIGHWAY_ROAD_HALF_WIDTH_METERS,
    roadRight: HIGHWAY_ROAD_HALF_WIDTH_METERS,
    shoulderWidth: HIGHWAY_SHOULDER_WIDTH_METERS,
    roadMarkings: HIGHWAY_MARKINGS,
  };
}

/**
 * Closed-lap calibration source used by circuit regressions and the BRANCHING parent
 * before its physical handoff.
 *
 * The 470 m end curves and 720 m alternating sweep retain the original high-speed
 * calibration loads. The second side additionally owns 90 m right-left-right
 * complexes after the BRANCHING handoff seam, so the CIRCUIT composition requires
 * two real braking sequences without changing the point-to-point route before its
 * exit. Every authored Raster turn is at most five degrees, below the frozen
 * ten-degree limit.
 */
export function createHighwayCalibrationLapRaster(): RasterPath {
  const turtle = new RasterTurtle({ x: 0, z: 0, sourceRadius: HIGHWAY_STANDARD_CURVE_RADIUS_METERS });
  const { vertices } = turtle;
  const appendStraight = (length: number) => turtle.appendStraight(length);
  const appendArc = (radius: number, turn: number) => turtle.appendArc(radius, turn);

  const appendLowSpeedComplex = (firstTurnSign: -1 | 1): void => {
    appendArc(HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS, (firstTurnSign * Math.PI) / 2);
    appendArc(HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS, -firstTurnSign * Math.PI);
    appendArc(HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS, (firstTurnSign * Math.PI) / 2);
  };

  const appendHighwaySide = (includeLowSpeedFinish: boolean): void => {
    appendStraight(700);
    appendArc(HIGHWAY_SWEEP_CURVE_RADIUS_METERS, (-20 * Math.PI) / 180);
    appendArc(HIGHWAY_SWEEP_CURVE_RADIUS_METERS, (40 * Math.PI) / 180);
    appendArc(HIGHWAY_SWEEP_CURVE_RADIUS_METERS, (-20 * Math.PI) / 180);
    if (includeLowSpeedFinish) {
      // Keep the gate/seam interval unchanged, then leave enough straight
      // between the right-left-right and mirrored left-right-left complexes for
      // two distinct braking/acceleration cycles.
      appendStraight(610);
      appendLowSpeedComplex(-1);
      appendStraight(HIGHWAY_LOW_SPEED_CONNECTOR_LENGTH_METERS);
      appendLowSpeedComplex(1);
      appendStraight(150);
    } else {
      appendStraight(700);
    }
  };

  appendHighwaySide(false);
  appendArc(HIGHWAY_STANDARD_CURVE_RADIUS_METERS, Math.PI);
  appendHighwaySide(true);
  appendArc(HIGHWAY_STANDARD_CURVE_RADIUS_METERS, Math.PI);
  if (!(
    turtle.z < 0 &&
    Math.abs(turtle.x) < 1e-7 &&
    Math.abs(Math.sin(turtle.heading)) < 1e-7 &&
    Math.cos(turtle.heading) > 1 - 1e-7
  )) {
    throw new Error('low-speed complexes must return on the start-side axis');
  }
  appendStraight(-turtle.z);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('calibration lap authoring failed to close');
  }
  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;
  return compileRasterPath(vertices);
}

function createHighwayHeightProfile(courseLength: number): HeightProfile {
  if (!(courseLength > 7_000)) throw new RangeError('calibration lap must remain longer than 7 km');
  return new HeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: 100, y: 0 },
    { s: 700, y: 0 },
    { s: 1_400, y: 12 },
    { s: 2_100, y: -8 },
    { s: 3_000, y: 24 },
    { s: 3_800, y: 0 },
    { s: 4_600, y: -12 },
    { s: 5_400, y: 22 },
    { s: 6_200, y: 0 },
    { s: 7_000, y: 10 },
    { s: courseLength, y: 0 },
  ]);
}

export function createHighwaySurfaceMap(courseLength: number): SurfaceMap {
  return new SurfaceMap(courseLength, [
    {
      sStart: 0,
      name: 'FOUR-LANE HIGHWAY CALIBRATION SURFACE',
      bands: [
        {
          lMin: -HIGHWAY_GROUND_HALF_WIDTH_METERS,
          lMax: -(HIGHWAY_ROAD_HALF_WIDTH_METERS + HIGHWAY_SHOULDER_WIDTH_METERS),
          type: 'GRASS',
        },
        {
          lMin: -(HIGHWAY_ROAD_HALF_WIDTH_METERS + HIGHWAY_SHOULDER_WIDTH_METERS),
          lMax: -HIGHWAY_ROAD_HALF_WIDTH_METERS,
          type: 'SHOULDER',
        },
        {
          lMin: -HIGHWAY_ROAD_HALF_WIDTH_METERS,
          lMax: HIGHWAY_ROAD_HALF_WIDTH_METERS,
          type: 'ASPHALT',
        },
        {
          lMin: HIGHWAY_ROAD_HALF_WIDTH_METERS,
          lMax: HIGHWAY_ROAD_HALF_WIDTH_METERS + HIGHWAY_SHOULDER_WIDTH_METERS,
          type: 'SHOULDER',
        },
        {
          lMin: HIGHWAY_ROAD_HALF_WIDTH_METERS + HIGHWAY_SHOULDER_WIDTH_METERS,
          lMax: HIGHWAY_GROUND_HALF_WIDTH_METERS,
          type: 'GRASS',
        },
      ],
    },
  ]);
}

export function createHighwayCalibrationRuntime(): CircuitLiveRuntime {
  const lapRaster = createHighwayCalibrationLapRaster();
  const topology = compileCircuitTopology('DEV__1_HIGHWAY_CALIBRATION_LOOP', lapRaster);
  const lapLength = topology.lapLength;
  const height = createHighwayHeightProfile(lapLength);
  const visual = new VisualProfile(lapLength, [
    {
      sStart: 0,
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
      name: 'FOUR-LANE HIGHWAY CALIBRATION',
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
      id: 'DEV__1_HIGHWAY_CALIBRATION_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
