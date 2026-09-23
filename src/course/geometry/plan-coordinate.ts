import type { Vec2 } from '../../core/math.js';
import type { Writable } from '../../core/writable.js';
import { createPlanarCoordinateSample } from '../../core/planar-sample.js';

/** Opaque local-projection identity, interpreted only by the reader that issued it. */
export type PlanProjectionSeed = number;

export interface PlanLateralBounds {
  readonly left: number;
  readonly right: number;
}

/** Admitted chainage interval and coordinate bounds; physical support is independent. */
export interface PlanCoordinateDomain {
  readonly start: number;
  readonly end: number;
  lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds;
}

export interface PlanCoordinateMetrics {
  readonly curvature: number;
  readonly metric: number;
  readonly offsetMetric: number;
}

export interface PlanCoordinateSample extends Writable<Vec2> {
  s: number;
  l: number;
  heading: number;
  seed: PlanProjectionSeed;
}

export interface PlanCoordinateProjection {
  s: number;
  l: number;
  seed: PlanProjectionSeed;
  distanceSquared: number;
}

/** One finite planar query interface in either a Section or an occurrence frame. */
export interface PlanCoordinateReader {
  readonly domain: PlanCoordinateDomain;
  toWorld(s: number, l: number, out: PlanCoordinateSample): PlanCoordinateSample;
  metricsAt(
    s: number,
    l: number,
    seed: PlanProjectionSeed,
    out: Writable<PlanCoordinateMetrics>,
  ): PlanCoordinateMetrics;
  locateLocal(
    world: Vec2,
    previousSeed: PlanProjectionSeed,
    searchRadius: number,
    out: PlanCoordinateProjection,
    workspace: PlanProjectionWorkspace,
  ): PlanCoordinateProjection;
}

/** A closed native projection interval, with its complete extent and centerline bounds. */
export interface PlanProjectionCandidate {
  readonly seed: PlanProjectionSeed;
  readonly start: number;
  readonly end: number;
  readonly extent: { readonly start: number; readonly end: number };
  readonly bounds: { readonly left: number; readonly right: number; readonly back: number; readonly front: number };
  project(world: Vec2, out: PlanCoordinateProjection, workspace: PlanProjectionWorkspace): PlanCoordinateProjection;
}

/** Section-side queries used to assemble occurrence readers without inspecting geometry. */
export interface SectionPlanCoordinateReader extends PlanCoordinateReader {
  /** Native seeds are dense integers in [0, seedCount), ordered along s. */
  readonly seedCount: number;
  projectionCandidates(start: number, end: number): readonly PlanProjectionCandidate[];
}

export function createPlanCoordinateSample(): PlanCoordinateSample {
  return { x: 0, z: 0, s: 0, l: 0, heading: 0, seed: -1 };
}

/** Numerical temporaries, not a second coordinate authority or live simulation state. */
export function createPlanProjectionWorkspace() {
  return {
    sample: createPlanarCoordinateSample(),
    candidate: { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
    projectionSample: createPlanarCoordinateSample(),
    projected: { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
    local: { x: 0, z: 0 },
    values: new Float64Array(4),
  };
}

export type PlanProjectionWorkspace = ReturnType<typeof createPlanProjectionWorkspace>;
