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

export const M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS = 2_045;
export const M9_3_TSUKUBA_HOME_STRAIGHT_LENGTH_METERS = 282;
export const M9_3_TSUKUBA_BACK_STRAIGHT_LENGTH_METERS = 437;
export const M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS = 6;
export const M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS = 12;
export const M9_3_TSUKUBA_PLAYER_START_L = -1.5;
export const M9_3_TSUKUBA_RIVAL_START_L = 1.5;

const SHOULDER_WIDTH_METERS = 1.5;
const MAX_ARC_STEP_DEGREES = 5;
const DEGREES = Math.PI / 180;

// These connector lengths close the original simplified arc reconstruction at exactly 2045 m.
// They are ordinary course authoring, not hidden runtime correction.
const TURN_ONE_TO_S_CURVE_METERS = 55;
const S_CURVE_TO_FIRST_HAIRPIN_METERS = 71.87557174791559;
const FIRST_HAIRPIN_TO_DUNLOP_METERS = 133.977611137319;
const DUNLOP_TO_EIGHTY_R_METERS = 91.78930477865659;
const ONE_SEVENTY_R_TO_SECOND_HAIRPIN_METERS = 50;
const EIGHTY_TO_ONE_SEVENTY_TRANSITION_METERS = 12;
const SECOND_HAIRPIN_COMPOUND_TRANSITION_METERS = 8;

export const M9_3_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_M9_3_TSUKUBA_COURSE_2000_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
  rivalCount: 1,
});

export const M9_3_TSUKUBA_PLAYER_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M9_3_TSUKUBA_PLAYER_START_L,
});

export const M9_3_TSUKUBA_RIVAL_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = Object.freeze({
  ...M5_RECOVERY_PROFILE,
  targetL: M9_3_TSUKUBA_RIVAL_START_L,
});

export interface M93TsukubaCourse2000Landmarks {
  readonly homeStraightEndS: number;
  readonly turnOneEndS: number;
  readonly sCurveEndS: number;
  readonly firstHairpinEndS: number;
  readonly dunlopEndS: number;
  readonly oneSeventyREndS: number;
  readonly secondHairpinEndS: number;
  readonly backStraightStartS: number;
  readonly backStraightEndS: number;
}

export interface M93TsukubaCourse2000Lap {
  readonly raster: RasterPath;
  readonly landmarks: M93TsukubaCourse2000Landmarks;
}

/**
 * Functional four-wheel Course 2000 reconstruction for CIRCUIT DEV composition.
 *
 * Officially published lengths, corner order and named-radius families establish the shape. The
 * exact arc angles and unlabelled connectors are an original simplified authoring chosen to close
 * the ordinary Raster path at the published 2045 m length. The motorcycle-only MC/Asia chicane is
 * deliberately absent. No handling, grip, camera or renderer rule is encoded here.
 */
export function createM93TsukubaCourse2000Lap(): M93TsukubaCourse2000Lap {
  const vertices: RasterVertex[] = [{ x: 0, z: 0, sourceRadius: 90 }];
  const turtle = { x: 0, z: 0, heading: 0 };
  let authoredS = 0;

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
    if (sign === 0) throw new RangeError('M9.3 Tsukuba arc turn must be non-zero');
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

  appendStraight(M9_3_TSUKUBA_HOME_STRAIGHT_LENGTH_METERS);
  const homeStraightEndS = authoredS;

  // Turn 1: published compound 55R entry / 35R exit, followed by its downhill exit.
  appendArc(55, 95);
  appendArc(35, 70);
  const turnOneEndS = authoredS;
  appendStraight(TURN_ONE_TO_S_CURVE_METERS);

  // The broad S is effectively straight in the official driving description.
  appendArc(75, -20);
  appendArc(75, 40);
  appendArc(75, -20);
  const sCurveEndS = authoredS;
  appendStraight(S_CURVE_TO_FIRST_HAIRPIN_METERS);

  // First hairpin: wide approach into the tight apex family.
  appendArc(105, -30);
  appendArc(25, -140);
  const firstHairpinEndS = authoredS;
  appendStraight(FIRST_HAIRPIN_TO_DUNLOP_METERS);

  // Dunlop is the published 35R, approximately 90-degree right.
  appendArc(35, 90);
  const dunlopEndS = authoredS;
  appendStraight(DUNLOP_TO_EIGHTY_R_METERS);

  // Four-wheel route only: 80R right into the long 170R left.
  appendArc(80, 25);
  appendStraight(EIGHTY_TO_ONE_SEVENTY_TRANSITION_METERS);
  appendArc(170, -40);
  const oneSeventyREndS = authoredS;
  appendStraight(ONE_SEVENTY_R_TO_SECOND_HAIRPIN_METERS);

  // Second hairpin: published 25R / 105R compound right.
  appendArc(25, 120);
  appendStraight(SECOND_HAIRPIN_COMPOUND_TRANSITION_METERS);
  appendArc(105, 50);
  const secondHairpinEndS = authoredS;

  const backStraightStartS = authoredS;
  appendStraight(M9_3_TSUKUBA_BACK_STRAIGHT_LENGTH_METERS);
  const backStraightEndS = authoredS;

  // Final compound: published 100R entry / 90R exit reconnects to the home straight.
  appendArc(100, 45);
  appendArc(90, 75);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('M9.3 Tsukuba Course 2000 authoring failed to close');
  }
  if (Math.abs(authoredS - M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS) > 1e-7) {
    throw new Error(`M9.3 Tsukuba authored length ${authoredS} must equal 2045 m`);
  }

  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;
  const raster = compileRasterPath(vertices);
  if (Math.abs(raster.length - M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS) > 1e-7) {
    throw new Error(`M9.3 Tsukuba Raster length ${raster.length} must equal 2045 m`);
  }

  return Object.freeze({
    raster,
    landmarks: Object.freeze({
      homeStraightEndS,
      turnOneEndS,
      sCurveEndS,
      firstHairpinEndS,
      dunlopEndS,
      oneSeventyREndS,
      secondHairpinEndS,
      backStraightStartS,
      backStraightEndS,
    }),
  });
}

function createM93TsukubaHeightProfile(courseLength: number): HeightProfile {
  return new HeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: 240, y: 1.6 },
    { s: 416, y: 0.2 },
    { s: 581, y: -0.5 },
    { s: 777, y: 0.3 },
    { s: 966, y: 1.2 },
    { s: 1_218, y: 0.2 },
    { s: 1_412, y: -0.6 },
    { s: 1_849, y: -0.4 },
    { s: 1_940, y: 0.2 },
    { s: courseLength, y: 0 },
  ]);
}

const TSUKUBA_EDGE_MARKINGS: readonly LongitudinalRoadMarking[] = Object.freeze([
  Object.freeze({
    centerL: -M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS + 0.15,
    width: 0.15,
    pattern: 'SOLID' as const,
  }),
  Object.freeze({
    centerL: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS - 0.15,
    width: 0.15,
    pattern: 'SOLID' as const,
  }),
]);

export function createM93TsukubaGroundProfile(): GroundMapProfile {
  return {
    groundLeft: M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS,
    groundRight: M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS,
    roadLeft: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
    roadRight: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
    shoulderWidth: SHOULDER_WIDTH_METERS,
    roadMarkings: TSUKUBA_EDGE_MARKINGS,
  };
}

function createM93TsukubaSurfaceMap(courseLength: number): SurfaceMap {
  const shoulderEdge = M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS + SHOULDER_WIDTH_METERS;
  return new SurfaceMap(courseLength, [{
    sStart: 0,
    name: 'M9.3 TSUKUBA COURSE 2000 SURFACE',
    bands: [
      { lMin: -M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS, lMax: -shoulderEdge, type: 'GRASS' },
      { lMin: -shoulderEdge, lMax: -M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS, type: 'SHOULDER' },
      {
        lMin: -M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
        lMax: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
        type: 'ASPHALT',
      },
      { lMin: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS, lMax: shoulderEdge, type: 'SHOULDER' },
      { lMin: shoulderEdge, lMax: M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS, type: 'GRASS' },
    ],
  }]);
}

export function createM93TsukubaCourse2000Runtime(): CircuitLiveRuntime {
  const authored = createM93TsukubaCourse2000Lap();
  const topology = compileCircuitTopology('DEV_M9_3_TSUKUBA_COURSE_2000', authored.raster);
  const lapLength = topology.lapLength;
  const height = createM93TsukubaHeightProfile(lapLength);
  const visual = new VisualProfile(lapLength, [{
    sStart: 0,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    name: 'M9.3 TSUKUBA COURSE 2000',
  }]);
  const surface = createM93TsukubaSurfaceMap(lapLength);

  return compileCircuitLiveRuntime(
    topology,
    0,
    {
      lMax: M9_3_TSUKUBA_GROUND_HALF_WIDTH_METERS,
      mMin: 0.25,
      dCam: CURRENT_CAMERA_DISTANCE_METERS,
    },
    { height, visual, surface },
    {
      id: 'DEV_M9_3_TSUKUBA_COURSE_2000_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
