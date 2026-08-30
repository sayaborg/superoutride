import { compileRasterPath, type RasterPath, type RasterVertex } from '../core/course.js';
import { CURRENT_CAMERA_DISTANCE_METERS } from '../core/presentation-scale.js';
import { compileCircuitTopology } from '../gameplay/circuit-topology.js';
import { compileCourseMode } from '../gameplay/course-mode.js';
import { compileCircuitLiveRuntime, type CircuitLiveRuntime } from '../runtime/circuit-live-runtime.js';
import { GROUND_COLORS } from '../visual/ground-map.js';
import { HeightProfile, type HeightNode } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import {
  M7_1_GROUND_HALF_WIDTH_METERS,
  createM71HighwaySurfaceMap,
} from './m7-1-highway-calibration-course.js';

export const M8_7_HIGH_SPEED_RADIUS_METERS = 680;
export const M8_7_MEDIUM_FAST_RADIUS_METERS = 520;
export const M8_7_MEDIUM_RADIUS_METERS = 320;
export const M8_7_TIGHT_MEDIUM_RADIUS_METERS = 190;
export const M8_7_END_CURVE_RADIUS_METERS = 380;
export const M8_7_JUMP_CREST_COUNT = 2;
export const M8_7_JUMP_DROP_LENGTH_METERS = 85;
export const M8_7_JUMP_CREST_LIFT_METERS = 8;
export const M8_7_JUMP_DROP_METERS = 6;
export const M8_7_DEV_COURSE_MODE = compileCourseMode({
  id: 'DEV_M8_7_VARIED_ELEVATION_THREE_LAP_ONE_RIVAL',
  routeKind: 'CIRCUIT',
  rivalCount: 1,
});

export interface M87VariedElevationCircuitLap {
  readonly raster: RasterPath;
  readonly jumpCrestChainages: readonly number[];
}

/**
 * Explicit CIRCUIT-only closed-lap authoring.
 *
 * Each side mixes four balanced left/right sweep families. The two identical sides cancel their
 * world displacement across ordinary 180-degree end curves, keeping closure explicit while
 * avoiding any Core/topology special case. Jump crest locations are authored on the last 500 m
 * straight of each side, before end-curve braking begins.
 */
export function createM87VariedElevationCircuitLap(): M87VariedElevationCircuitLap {
  const vertices: RasterVertex[] = [{ x: 0, z: 0, sourceRadius: M8_7_END_CURVE_RADIUS_METERS }];
  const jumpCrestVertexIndices: number[] = [];
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
    if (sign === 0) throw new RangeError('M8.7 circuit arc turn must be non-zero');
    vertices[vertices.length - 1]!.sourceRadius = radius;
    const startX = turtle.x;
    const startZ = turtle.z;
    const startHeading = turtle.heading;
    const centerX = startX + sign * radius * Math.cos(startHeading);
    const centerZ = startZ - sign * radius * Math.sin(startHeading);
    const steps = Math.ceil(Math.abs(turn) / (5 * Math.PI / 180));

    for (let i = 1; i <= steps; i += 1) {
      const heading = startHeading + turn * i / steps;
      turtle.x = centerX - sign * radius * Math.cos(heading);
      turtle.z = centerZ + sign * radius * Math.sin(heading);
      vertices.push({ x: turtle.x, z: turtle.z, sourceRadius: radius });
    }
    turtle.heading = startHeading + turn;
  };

  const appendBalancedSweep = (radius: number, firstSign: -1 | 1, angleDegrees: number): void => {
    const angle = angleDegrees * Math.PI / 180;
    appendArc(radius, firstSign * angle);
    appendArc(radius, -firstSign * 2 * angle);
    appendArc(radius, firstSign * angle);
  };

  const appendSide = (): void => {
    appendStraight(450);
    appendBalancedSweep(M8_7_HIGH_SPEED_RADIUS_METERS, -1, 20);
    appendStraight(180);
    appendBalancedSweep(M8_7_MEDIUM_RADIUS_METERS, 1, 35);
    appendStraight(260);
    appendBalancedSweep(M8_7_MEDIUM_FAST_RADIUS_METERS, -1, 25);
    appendStraight(220);
    appendBalancedSweep(M8_7_TIGHT_MEDIUM_RADIUS_METERS, 1, 45);
    appendStraight(200);
    jumpCrestVertexIndices.push(vertices.length - 1);
    appendStraight(300);
  };

  appendSide();
  appendArc(M8_7_END_CURVE_RADIUS_METERS, Math.PI);
  appendSide();
  appendArc(M8_7_END_CURVE_RADIUS_METERS, Math.PI);

  if (Math.hypot(turtle.x, turtle.z) > 1e-7) {
    throw new Error('M8.7 varied-elevation circuit authoring failed to close');
  }
  const last = vertices[vertices.length - 1]!;
  last.x = 0;
  last.z = 0;
  last.sourceRadius = vertices[0]!.sourceRadius;

  const raster = compileRasterPath(vertices);
  const jumpCrestChainages = jumpCrestVertexIndices.map((index) => raster.vertexS[index]!);
  return Object.freeze({
    raster,
    jumpCrestChainages: Object.freeze(jumpCrestChainages),
  });
}

export function createM87VariedElevationHeightProfile(
  courseLength: number,
  jumpCrestChainages: readonly number[],
): HeightProfile {
  if (jumpCrestChainages.length !== M8_7_JUMP_CREST_COUNT) {
    throw new Error(`M8.7 circuit requires exactly ${M8_7_JUMP_CREST_COUNT} jump crests`);
  }
  const broadShape = [
    { ratio: 0, y: 0 },
    { ratio: 0.08, y: 30 },
    { ratio: 0.18, y: -26 },
    { ratio: 0.28, y: 50 },
    { ratio: 0.38, y: -38 },
    { ratio: 0.50, y: 20 },
    { ratio: 0.62, y: 62 },
    { ratio: 0.72, y: -34 },
    { ratio: 0.82, y: 46 },
    { ratio: 0.92, y: -24 },
    { ratio: 1, y: 0 },
  ] as const;
  const baseElevationAt = (s: number): number => {
    const ratio = s / courseLength;
    for (let i = 0; i < broadShape.length - 1; i += 1) {
      const a = broadShape[i]!;
      const b = broadShape[i + 1]!;
      if (ratio <= b.ratio) {
        const t = (ratio - a.ratio) / (b.ratio - a.ratio);
        return a.y + (b.y - a.y) * t;
      }
    }
    return broadShape.at(-1)!.y;
  };
  const jumpWindows = jumpCrestChainages.map((crest) => ({ start: crest - 220, end: crest + 700 }));
  const nodes: HeightNode[] = broadShape
    .map((node) => ({ s: node.ratio * courseLength, y: node.y }))
    .filter((node) => node.s === 0 || node.s === courseLength || !jumpWindows.some(
      (window) => node.s > window.start && node.s < window.end,
    ));

  for (const crest of jumpCrestChainages) {
    const crestHeight = Math.max(
      baseElevationAt(crest - 220),
      baseElevationAt(crest),
      baseElevationAt(crest + 700),
    ) + M8_7_JUMP_CREST_LIFT_METERS;
    nodes.push(
      { s: crest - 220, y: baseElevationAt(crest - 220) },
      { s: crest, y: crestHeight },
      { s: crest + M8_7_JUMP_DROP_LENGTH_METERS, y: crestHeight - M8_7_JUMP_DROP_METERS },
      { s: crest + 700, y: baseElevationAt(crest + 700) },
    );
  }
  nodes.sort((a, b) => a.s - b.s);
  return new HeightProfile(courseLength, nodes);
}

export function createM87VariedElevationCircuitRuntime(): CircuitLiveRuntime {
  const authored = createM87VariedElevationCircuitLap();
  const topology = compileCircuitTopology('DEV_M8_7_VARIED_ELEVATION_CIRCUIT', authored.raster);
  const lapLength = topology.lapLength;
  const height = createM87VariedElevationHeightProfile(lapLength, authored.jumpCrestChainages);
  const visual = new VisualProfile(lapLength, [{
    sStart: 0,
    groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
    groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    name: 'M8.7 VARIED-ELEVATION MEDIUM/HIGH-SPEED CIRCUIT',
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
      id: 'DEV_M8_7_VARIED_ELEVATION_THREE_LAP_RACE',
      lapCount: 3,
      checkpointChainages: [lapLength * 0.25, lapLength * 0.5, lapLength * 0.75],
    },
  );
}
