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

export const M9_6_FISCO_LENGTH_METERS = 4_563;
export const M9_6_FISCO_HOME_STRAIGHT_LENGTH_METERS = 1_475;
export const M9_6_FISCO_CORNER_COUNT = 17;
export const M9_6_FISCO_ROAD_HALF_WIDTH_METERS = 9;
export const M9_6_FISCO_GROUND_HALF_WIDTH_METERS = 17;
export const M9_6_FISCO_PLAYER_START_L = -2;
export const M9_6_FISCO_RIVAL_START_L = 2;

const SHOULDER_WIDTH_METERS = 2;
const MAX_ARC_STEP_DEGREES = 5;
const DEGREES = Math.PI / 180;

// Fixed original connectors close the simplified 17-corner reconstruction at exactly 4563 m.
// They are ordinary DEV course authoring, never a runtime correction or hidden geometry warp.
const HUNDRED_R_EXIT_TO_ADVAN_METERS = 382.79771304454766;
const ADVAN_EXIT_TO_THREE_HUNDRED_R_METERS = 227.70463638058752;
const TURN_THIRTEEN_TO_TURN_FOURTEEN_METERS = 430.3828989144511;

export const M9_6_FISCO_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_M9_6_FISCO_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
  rivalCount: 1,
});

export const M9_6_FISCO_PLAYER_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M9_6_FISCO_PLAYER_START_L,
});

export const M9_6_FISCO_RIVAL_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M9_6_FISCO_RIVAL_START_L,
});

export interface M96FiscoLandmarks {
  readonly homeStraightEndS: number;
  readonly tgrCornerEndS: number;
  readonly secondCornerEndS: number;
  readonly cocaColaCornerEndS: number;
  readonly hundredREndS: number;
  readonly advanCornerEndS: number;
  readonly threeHundredREndS: number;
  readonly dunlopComplexEndS: number;
  readonly turnThirteenEndS: number;
  readonly turnFourteenEndS: number;
  readonly turnFifteenEndS: number;
  readonly panasonicCornerEndS: number;
}

export interface M96FiscoLap {
  readonly raster: RasterPath;
  readonly landmarks: M96FiscoLandmarks;
}

/**
 * Functional reconstruction of the current Fuji Speedway four-wheel racing course.
 *
 * Official dimensions, direction, corner count, named sequence and elevation envelope establish
 * its identity. Exact unpublished centerline coordinates, radii, arc angles and connectors are an
 * original simplified reconstruction. No handling, grip, camera or renderer rule is encoded here.
 */
export function createM96FiscoLap(): M96FiscoLap {
  const vertices: RasterVertex[] = [{ x: 0, z: 0, sourceRadius: 70 }];
  const turtle = { x: 0, z: 0, heading: 0 };
  let authoredS = 0;
  let authoredCornerCount = 0;

  const appendStraight = (length: number): void => {
    const steps = Math.ceil(length / 50);
    const stepLength = length / steps;
    for (let step = 0; step < steps; step += 1) {
      turtle.x += Math.sin(turtle.heading) * stepLength;
      turtle.z += Math.cos(turtle.heading) * stepLength;
      vertices.push({ x: turtle.x, z: turtle.z });
      authoredS += stepLength;
    }
  };

  const appendArc = (radius: number, turnDegrees: number): void => {
    const turn = turnDegrees * DEGREES;
    const sign = Math.sign(turn);
    if (sign === 0) throw new RangeError('M9.6 FISCO arc turn must be non-zero');
    authoredCornerCount += 1;
    vertices[vertices.length - 1]!.sourceRadius = radius;
    const startX = turtle.x;
    const startZ = turtle.z;
    const startHeading = turtle.heading;
    const centerX = startX + sign * radius * Math.cos(startHeading);
    const centerZ = startZ - sign * radius * Math.sin(startHeading);
    const steps = Math.ceil(Math.abs(turnDegrees) / MAX_ARC_STEP_DEGREES);
    const chordLength = 2 * radius * Math.sin(Math.abs(turn) / (2 * steps));

    for (let step = 1; step <= steps; step += 1) {
      const heading = startHeading + turn * step / steps;
      turtle.x = centerX - sign * radius * Math.cos(heading);
      turtle.z = centerZ + sign * radius * Math.sin(heading);
      vertices.push({ x: turtle.x, z: turtle.z, sourceRadius: radius });
      authoredS += chordLength;
    }
    turtle.heading = startHeading + turn;
  };

  appendStraight(M9_6_FISCO_HOME_STRAIGHT_LENGTH_METERS);
  const homeStraightEndS = authoredS;

  // T1/T2: heavy-braking TGR right followed by the official 75R right.
  appendArc(45, 105);
  const tgrCornerEndS = authoredS;
  appendStraight(20);
  appendArc(75, 75);
  const secondCornerEndS = authoredS;
  appendStraight(20);

  // T3 Coca-Cola is the official 80R left leading into the sustained 100R right family.
  appendArc(80, -80);
  const cocaColaCornerEndS = authoredS;
  appendStraight(80);
  appendArc(100, 60);
  appendStraight(20);
  appendArc(100, 60);
  const hundredREndS = authoredS;
  appendStraight(HUNDRED_R_EXIT_TO_ADVAN_METERS);

  // T6 ADVAN left hairpin, then the fast two-part 300R right.
  appendArc(40, -150);
  const advanCornerEndS = authoredS;
  appendStraight(ADVAN_EXIT_TO_THREE_HUNDRED_R_METERS);
  appendArc(300, 30);
  appendStraight(20);
  appendArc(300, 30);
  const threeHundredREndS = authoredS;
  appendStraight(20);

  // Dunlop braking complex: right-left-right before the uphill technical section.
  appendArc(35, 90);
  appendStraight(80);
  appendArc(30, -80);
  appendStraight(20);
  appendArc(40, 70);
  const dunlopComplexEndS = authoredS;
  appendStraight(20);

  // T12/T13 begin the official low-speed uphill technical section.
  appendArc(55, 60);
  appendStraight(80);
  appendArc(50, -70);
  const turnThirteenEndS = authoredS;
  appendStraight(TURN_THIRTEEN_TO_TURN_FOURTEEN_METERS);

  // T14 through T17: alternating technical corners into the Panasonic exit.
  appendArc(60, 60);
  const turnFourteenEndS = authoredS;
  appendStraight(20);
  appendArc(65, -55);
  const turnFifteenEndS = authoredS;
  appendStraight(80);
  appendArc(90, 80);
  appendStraight(20);
  appendArc(70, 75);
  const panasonicCornerEndS = authoredS;
  appendStraight(20);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('M9.6 FISCO authoring failed to close');
  }
  if (Math.abs(authoredS - M9_6_FISCO_LENGTH_METERS) > 1e-7) {
    throw new Error(`M9.6 FISCO authored length ${authoredS} must equal 4563 m`);
  }
  if (authoredCornerCount !== M9_6_FISCO_CORNER_COUNT) {
    throw new Error(`M9.6 FISCO must author ${M9_6_FISCO_CORNER_COUNT} corners`);
  }

  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;
  const raster = compileRasterPath(vertices);
  if (Math.abs(raster.length - M9_6_FISCO_LENGTH_METERS) > 1e-7) {
    throw new Error(`M9.6 FISCO Raster length ${raster.length} must equal 4563 m`);
  }

  return Object.freeze({
    raster,
    landmarks: Object.freeze({
      homeStraightEndS,
      tgrCornerEndS,
      secondCornerEndS,
      cocaColaCornerEndS,
      hundredREndS,
      advanCornerEndS,
      threeHundredREndS,
      dunlopComplexEndS,
      turnThirteenEndS,
      turnFourteenEndS,
      turnFifteenEndS,
      panasonicCornerEndS,
    }),
  });
}

function createM96FiscoHeightProfile(
  courseLength: number,
  landmarks: M96FiscoLandmarks,
): HeightProfile {
  return new HeightProfile(courseLength, [
    { s: 0, y: 40 },
    { s: landmarks.homeStraightEndS, y: 40 },
    { s: landmarks.tgrCornerEndS, y: 35 },
    { s: landmarks.cocaColaCornerEndS, y: 25 },
    { s: landmarks.hundredREndS, y: 22 },
    { s: landmarks.advanCornerEndS, y: 15 },
    { s: landmarks.threeHundredREndS, y: 6 },
    { s: landmarks.dunlopComplexEndS, y: 0 },
    { s: landmarks.turnThirteenEndS, y: 8 },
    { s: landmarks.turnFourteenEndS, y: 30 },
    { s: landmarks.turnFifteenEndS, y: 35 },
    { s: courseLength, y: 40 },
  ]);
}

const FISCO_EDGE_MARKINGS: readonly LongitudinalRoadMarking[] = Object.freeze([
  Object.freeze({
    centerL: -M9_6_FISCO_ROAD_HALF_WIDTH_METERS + 0.15,
    width: 0.15,
    pattern: 'SOLID' as const,
  }),
  Object.freeze({
    centerL: M9_6_FISCO_ROAD_HALF_WIDTH_METERS - 0.15,
    width: 0.15,
    pattern: 'SOLID' as const,
  }),
]);

export function createM96FiscoGroundProfile(): GroundMapProfile {
  return {
    groundLeft: M9_6_FISCO_GROUND_HALF_WIDTH_METERS,
    groundRight: M9_6_FISCO_GROUND_HALF_WIDTH_METERS,
    roadLeft: M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
    roadRight: M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
    shoulderWidth: SHOULDER_WIDTH_METERS,
    roadMarkings: FISCO_EDGE_MARKINGS,
  };
}

function createM96FiscoSurfaceMap(courseLength: number): SurfaceMap {
  const shoulderEdge = M9_6_FISCO_ROAD_HALF_WIDTH_METERS + SHOULDER_WIDTH_METERS;
  return new SurfaceMap(courseLength, [{
    sStart: 0,
    name: 'M9.6 FISCO SURFACE',
    bands: [
      { lMin: -M9_6_FISCO_GROUND_HALF_WIDTH_METERS, lMax: -shoulderEdge, type: 'GRASS' },
      { lMin: -shoulderEdge, lMax: -M9_6_FISCO_ROAD_HALF_WIDTH_METERS, type: 'SHOULDER' },
      {
        lMin: -M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
        lMax: M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
        type: 'ASPHALT',
      },
      { lMin: M9_6_FISCO_ROAD_HALF_WIDTH_METERS, lMax: shoulderEdge, type: 'SHOULDER' },
      { lMin: shoulderEdge, lMax: M9_6_FISCO_GROUND_HALF_WIDTH_METERS, type: 'GRASS' },
    ],
  }]);
}

export function createM96FiscoRuntime(): CircuitLiveRuntime {
  const authored = createM96FiscoLap();
  const topology = compileCircuitTopology('DEV_M9_6_FISCO', authored.raster);
  const lapLength = topology.lapLength;
  const height = createM96FiscoHeightProfile(lapLength, authored.landmarks);
  const visual = new VisualProfile(lapLength, [{
    sStart: 0,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    name: 'M9.6 FISCO',
  }]);
  const surface = createM96FiscoSurfaceMap(lapLength);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: M9_6_FISCO_GROUND_HALF_WIDTH_METERS,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV_M9_6_FISCO_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
