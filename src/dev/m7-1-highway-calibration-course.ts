import { compileRasterPath, type RasterPath, type RasterVertex } from '../core/course.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { compileCircuitTopology } from '../gameplay/circuit-topology.js';
import { compileCourseMode } from '../gameplay/course-mode.js';
import { M5_RECOVERY_PROFILE, type M5RecoveryProfile } from '../gameplay/recovery.js';
import { SurfaceMap } from '../physics/surface-map.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../runtime/circuit-live-runtime.js';
import {
  GROUND_COLORS,
  type GroundMapProfile,
  type LongitudinalRoadMarking,
} from '../visual/ground-map.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';

export const M7_1_LANE_COUNT = 4;
export const M7_1_LANE_WIDTH_METERS = 3.5;
export const M7_1_ROAD_HALF_WIDTH_METERS = M7_1_LANE_COUNT * M7_1_LANE_WIDTH_METERS * 0.5;
export const M7_1_SHOULDER_WIDTH_METERS = 1.5;
export const M7_1_GROUND_HALF_WIDTH_METERS = 12;
export const M7_1_PLAYER_START_L = -M7_1_LANE_WIDTH_METERS * 0.5;
export const M7_1_RIVAL_START_L = M7_1_LANE_WIDTH_METERS * 0.5;

export const M7_1_LANE_MARKING_WIDTH_METERS = 0.15;
export const M7_1_EDGE_MARKING_WIDTH_METERS = 0.20;
export const M7_1_MARKING_DASH_LENGTH_METERS = 8;
export const M7_1_MARKING_GAP_LENGTH_METERS = 12;

export const M7_1_STANDARD_CURVE_RADIUS_METERS = 470;
export const M7_1_SWEEP_CURVE_RADIUS_METERS = 720;
export const M7_1_AIRBORNE_PROBE_START_S = 250;

export const M7_1_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_HIGHWAY_CALIBRATION_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
  rivalCount: 1,
});

export const M7_1_HIGHWAY_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M7_1_PLAYER_START_L,
});

export const M7_1_HIGHWAY_RIVAL_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M7_1_RIVAL_START_L,
});

const HIGHWAY_MARKINGS: readonly LongitudinalRoadMarking[] = Object.freeze([
  Object.freeze({
    centerL: -M7_1_ROAD_HALF_WIDTH_METERS,
    width: M7_1_EDGE_MARKING_WIDTH_METERS,
    pattern: 'SOLID' as const,
  }),
  ...[-M7_1_LANE_WIDTH_METERS, 0, M7_1_LANE_WIDTH_METERS].map((centerL) => Object.freeze({
    centerL,
    width: M7_1_LANE_MARKING_WIDTH_METERS,
    pattern: 'DASHED' as const,
    dashLength: M7_1_MARKING_DASH_LENGTH_METERS,
    gapLength: M7_1_MARKING_GAP_LENGTH_METERS,
  })),
  Object.freeze({
    centerL: M7_1_ROAD_HALF_WIDTH_METERS,
    width: M7_1_EDGE_MARKING_WIDTH_METERS,
    pattern: 'SOLID' as const,
  }),
]);

export function createM71HighwayGroundProfile(): GroundMapProfile {
  return {
    groundLeft: M7_1_GROUND_HALF_WIDTH_METERS,
    groundRight: M7_1_GROUND_HALF_WIDTH_METERS,
    roadLeft: M7_1_ROAD_HALF_WIDTH_METERS,
    roadRight: M7_1_ROAD_HALF_WIDTH_METERS,
    shoulderWidth: M7_1_SHOULDER_WIDTH_METERS,
    roadMarkings: HIGHWAY_MARKINGS,
  };
}

/**
 * Long explicit closed-lap authoring used only by the M7.1 calibration composition.
 *
 * The 470 m end curves remain above the Japanese 100 km/h ordinary minimum
 * reference of 460 m after Raster-to-Guide filleting. The 720 m alternating
 * sweep supplies both left and right steering load. Every authored Raster turn
 * is at most five degrees, below the frozen ten-degree limit.
 */
export function createM71HighwayCalibrationLapRaster(): RasterPath {
  const vertices: RasterVertex[] = [{
    x: 0,
    z: 0,
    sourceRadius: M7_1_STANDARD_CURVE_RADIUS_METERS,
  }];
  const turtle = { x: 0, z: 0, heading: 0 };

  const appendStraight = (length: number): void => {
    const steps = Math.ceil(length / 50);
    const stepLength = length / steps;
    for (let step = 0; step < steps; step += 1) {
      turtle.x += Math.sin(turtle.heading) * stepLength;
      turtle.z += Math.cos(turtle.heading) * stepLength;
      vertices.push({ x: turtle.x, z: turtle.z });
    }
  };

  const appendArc = (radius: number, turn: number): void => {
    const sign = Math.sign(turn);
    if (sign === 0) throw new RangeError('calibration arc turn must be non-zero');
    vertices[vertices.length - 1]!.sourceRadius = radius;
    const startX = turtle.x;
    const startZ = turtle.z;
    const startHeading = turtle.heading;
    const centerX = startX + sign * radius * Math.cos(startHeading);
    const centerZ = startZ - sign * radius * Math.sin(startHeading);
    const maxTurnStep = 5 * Math.PI / 180;
    const steps = Math.ceil(Math.abs(turn) / maxTurnStep);

    for (let i = 1; i <= steps; i += 1) {
      const heading = startHeading + turn * i / steps;
      turtle.x = centerX - sign * radius * Math.cos(heading);
      turtle.z = centerZ + sign * radius * Math.sin(heading);
      vertices.push({ x: turtle.x, z: turtle.z, sourceRadius: radius });
    }
    turtle.heading = startHeading + turn;
  };

  const appendHighwaySide = (): void => {
    appendStraight(700);
    appendArc(M7_1_SWEEP_CURVE_RADIUS_METERS, -20 * Math.PI / 180);
    appendArc(M7_1_SWEEP_CURVE_RADIUS_METERS, 40 * Math.PI / 180);
    appendArc(M7_1_SWEEP_CURVE_RADIUS_METERS, -20 * Math.PI / 180);
    appendStraight(700);
  };

  appendHighwaySide();
  appendArc(M7_1_STANDARD_CURVE_RADIUS_METERS, Math.PI);
  appendHighwaySide();
  appendArc(M7_1_STANDARD_CURVE_RADIUS_METERS, Math.PI);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('M7.1 calibration lap authoring failed to close');
  }
  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;
  return compileRasterPath(vertices);
}

export function createM71HighwayHeightProfile(courseLength: number): HeightProfile {
  if (!(courseLength > 7_000)) throw new RangeError('M7.1 calibration lap must remain longer than 7 km');
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

export function createM71HighwaySurfaceMap(courseLength: number): SurfaceMap {
  return new SurfaceMap(courseLength, [{
    sStart: 0,
    name: 'M7.1 FOUR-LANE HIGHWAY CALIBRATION SURFACE',
    bands: [
      {
        lMin: -M7_1_GROUND_HALF_WIDTH_METERS,
        lMax: -(M7_1_ROAD_HALF_WIDTH_METERS + M7_1_SHOULDER_WIDTH_METERS),
        type: 'GRASS',
      },
      {
        lMin: -(M7_1_ROAD_HALF_WIDTH_METERS + M7_1_SHOULDER_WIDTH_METERS),
        lMax: -M7_1_ROAD_HALF_WIDTH_METERS,
        type: 'SHOULDER',
      },
      {
        lMin: -M7_1_ROAD_HALF_WIDTH_METERS,
        lMax: M7_1_ROAD_HALF_WIDTH_METERS,
        type: 'ASPHALT',
      },
      {
        lMin: M7_1_ROAD_HALF_WIDTH_METERS,
        lMax: M7_1_ROAD_HALF_WIDTH_METERS + M7_1_SHOULDER_WIDTH_METERS,
        type: 'SHOULDER',
      },
      {
        lMin: M7_1_ROAD_HALF_WIDTH_METERS + M7_1_SHOULDER_WIDTH_METERS,
        lMax: M7_1_GROUND_HALF_WIDTH_METERS,
        type: 'GRASS',
      },
    ],
  }]);
}

export function createM71HighwayCalibrationRuntime(): CircuitLiveRuntime {
  const lapRaster = createM71HighwayCalibrationLapRaster();
  const topology = compileCircuitTopology('DEV_M7_1_HIGHWAY_CALIBRATION_LOOP', lapRaster);
  const lapLength = topology.lapLength;
  const height = createM71HighwayHeightProfile(lapLength);
  const visual = new VisualProfile(lapLength, [{
    sStart: 0,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    name: 'M7.1 FOUR-LANE HIGHWAY CALIBRATION',
  }]);
  const surface = createM71HighwaySurfaceMap(lapLength);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: M7_1_GROUND_HALF_WIDTH_METERS,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV_M7_1_HIGHWAY_CALIBRATION_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
