import type { Vec2 } from '../../core/math.js';
import type { Writable } from '../../core/writable.js';
/** Search within this many metres of the previous chainage, in either reader frame. */
export const PLAN_PROJECTION_WINDOW_METERS = 50;

export interface PlanLateralBounds {
  readonly left: number;
  readonly right: number;
}

/** Admitted chainage interval and coordinate bounds; physical support is independent. */
export interface PlanCoordinateDomain {
  lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds;
}

export interface PlanCoordinateMetrics {
  readonly curvature: number;
  readonly offsetMetric: number;
}

export interface PlanCoordinateSample extends Writable<Vec2> {
  s: number;
  l: number;
  heading: number;
}

export interface PlanCoordinateProjection {
  s: number;
  l: number;
  /** False for the nearest fallback, including a clamped endpoint. */
  inDomain: boolean;
}

export interface PlanProjectionCandidateSample {
  s: number;
  l: number;
  isFoot: boolean;
  distanceSquared: number;
}

/** One finite planar query interface in either a Section or an occurrence frame. */
export interface PlanCoordinateReader {
  readonly domain: PlanCoordinateDomain;
  toWorld(s: number, l: number, out: PlanCoordinateSample): PlanCoordinateSample;
  metricsAt(s: number, l: number, out: Writable<PlanCoordinateMetrics>): PlanCoordinateMetrics;
  locateLocal(
    world: Vec2,
    previousS: number,
    out: PlanCoordinateProjection,
    workspace: PlanProjectionWorkspace,
  ): PlanCoordinateProjection;
}

/** A closed native projection interval, with its complete extent and centerline bounds. */
export interface PlanProjectionCandidate {
  readonly start: number;
  readonly end: number;
  project(world: Vec2, start: number, end: number, out: PlanProjectionCandidateSample): void;
}

/** Section-side queries used to assemble occurrence readers without inspecting geometry. */
export interface SectionPlanCoordinateReader extends PlanCoordinateReader {
  readonly domain: PlanCoordinateDomain & { readonly start: number; readonly end: number };
  projectionCandidates(start: number, end: number): readonly PlanProjectionCandidate[];
}

export function createPlanCoordinateSample(): PlanCoordinateSample {
  return { x: 0, z: 0, s: 0, l: 0, heading: 0 };
}

/** Numerical temporaries, not a second coordinate authority or live simulation state. */
export function createPlanProjectionWorkspace() {
  return {
    local: { x: 0, z: 0 },
    candidate: { s: 0, l: 0, isFoot: false, distanceSquared: 0 },
    bounds: { left: 0, right: 0 },
  };
}

export type PlanProjectionWorkspace = ReturnType<typeof createPlanProjectionWorkspace>;
