import { compileRasterCourse, type RasterVertex } from '../core/course.js';
import { compileGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { normalFromHeading } from '../core/math.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import { createGuideChart } from '../gameplay/guide-chart.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import { SurfaceMap, type SurfaceBand } from '../physics/surface-map.js';
import { compileStageContinuationLink, type StageContinuationLink } from './stage-continuation-link.js';
import type { GroundMapProfile } from '../visual/ground-map.js';

export interface RasterSuccessorSource {
  readonly guide: GuideCurve;
  readonly chart: GuideChart;
  readonly groundProfile: GroundMapProfile;
}

export interface RasterSuccessorAuthoring {
  readonly id: string;
  readonly chartId: string;
  readonly roadViewId: string;
  readonly surfaceSectionName: string;
  readonly sourceSeamMinS: number;
  readonly overlapMargin: number;
  readonly transitionLead: number;
  readonly finishAfterSeam: number;
  readonly deformationMeters: number;
  readonly deformationDirection: -1 | 1;
  readonly gentleTurnLimitDegrees: number;
  readonly minDeformationRunVertices: number;
  readonly dCam: number;
  readonly dMax: number;
  readonly groundMapHalfWidth: number;
  readonly groundHalfWidth: number;
  readonly roadHalfWidth: number;
  readonly shoulderWidth: number;
}

export interface RasterSuccessorRuntimeSource {
  readonly guide: GuideCurve;
  readonly chart: GuideChart;
  readonly roadView: StageRoadView;
  readonly surfaceMap: StageSurfaceMapView;
  readonly groundProfile: GroundMapProfile;
  readonly link: StageContinuationLink;
  readonly sourceTransitionS: number;
  readonly sourceSeamS: number;
  readonly targetSeamS: number;
  readonly finishS: number;
}

/**
 * Build one independent open Raster/Guide successor from an already compiled stage.
 *
 * Only the authored overlap is copied from the source. Immediately after that overlap the successor
 * owns a forward runout whose initial tangent is the source tangent at the cut. A smooth sin² lateral
 * excursion gives opposite successor authoring genuinely different geometry while returning to the
 * same forward tangent. Nothing ever reconnects to the source start or depends on cyclic topology.
 */
export function createRasterStageSuccessor(
  source: RasterSuccessorSource,
  authoring: RasterSuccessorAuthoring,
): RasterSuccessorRuntimeSource {
  assertAuthoring(authoring);
  const raster = source.guide.raster;
  const seamIndex = raster.vertexS.findIndex((s) => s >= authoring.sourceSeamMinS);
  if (seamIndex < 0) throw new RangeError(`${authoring.id} source is too short for successor seam`);
  const sourceSeamS = raster.vertexS[seamIndex]!;
  const sourceStartIndex = findLastVertexAtOrBefore(raster.vertexS, sourceSeamS - authoring.overlapMargin);
  const sharedEndIndex = raster.vertexS.findIndex(
    (s, index) => index > seamIndex && s >= sourceSeamS + authoring.overlapMargin,
  );
  if (sourceStartIndex <= 0 || sharedEndIndex < 0 || sharedEndIndex >= raster.segments.length) {
    throw new RangeError(`${authoring.id} source lacks successor overlap envelope and forward tangent`);
  }

  const prefix = raster.vertices.slice(sourceStartIndex, sharedEndIndex + 1).map(copyVertex);
  const runoutStart = prefix.at(-1)!;
  const runoutHeading = raster.segments[sharedEndIndex]!.heading;
  const runoutLength = Math.max(
    2 * authoring.dMax,
    authoring.finishAfterSeam + authoring.overlapMargin + authoring.dCam,
  );
  const runout = buildOpenRunout(
    runoutStart,
    runoutHeading,
    runoutLength,
    authoring.minDeformationRunVertices,
    authoring.deformationDirection * authoring.deformationMeters,
  );

  const successorRaster = compileRasterCourse([...prefix, ...runout]);
  const runoutTurnStart = Math.max(1, prefix.length - 1);
  const maxRunoutTurnDegrees = successorRaster.vertexTurns
    .slice(runoutTurnStart)
    .reduce((max, turn) => Math.max(max, Math.abs(turn) * 180 / Math.PI), 0);
  if (maxRunoutTurnDegrees > authoring.gentleTurnLimitDegrees + 1e-9) {
    throw new Error(
      `${authoring.id} generated runout turn ${maxRunoutTurnDegrees.toFixed(6)}° exceeds authored gentle-turn limit`,
    );
  }

  const guide = compileGuideCurve(successorRaster, {
    lMax: source.guide.lMax,
    mMin: source.guide.mMin,
    dCam: authoring.dCam,
  });
  if (!(guide.length > 2 * authoring.dMax)) {
    throw new Error(`${authoring.id} successor Guide must exceed 2*dMax`);
  }

  const origin = source.chart.lateralOrigin;
  const chart = createGuideChart(authoring.chartId, guide, origin);
  const roadView = createStageRoadView({
    id: authoring.roadViewId,
    sourceLateralOrigin: origin,
    groundLeft: authoring.groundHalfWidth,
    groundRight: authoring.groundHalfWidth,
    roadLeft: authoring.roadHalfWidth,
    roadRight: authoring.roadHalfWidth,
    shoulderWidth: authoring.shoulderWidth,
  });
  const sourceSurfaceMap = new SurfaceMap(guide.length, [{
    sStart: 0,
    name: authoring.surfaceSectionName,
    bands: singleRoadSurfaceBands(origin, authoring),
  }]);
  const surfaceMap = new StageSurfaceMapView(sourceSurfaceMap, roadView);
  const sourceStartS = raster.vertexS[sourceStartIndex]!;
  const groundProfile: GroundMapProfile = {
    groundLeft: authoring.groundMapHalfWidth,
    groundRight: authoring.groundMapHalfWidth,
    roadLeft: authoring.roadHalfWidth,
    roadRight: authoring.roadHalfWidth,
    shoulderWidth: authoring.shoulderWidth,
    roadCenterL: origin,
    chainageOffsetS: (source.groundProfile.chainageOffsetS ?? 0) + sourceStartS,
  };

  const targetSeamIndex = seamIndex - sourceStartIndex;
  const targetSeamS = successorRaster.vertexS[targetSeamIndex]!;
  const link = compileStageContinuationLink({
    id: authoring.id,
    sourceFrame: source.chart,
    targetFrame: chart,
    sourceSeamS,
    targetSeamS,
    sourceLocalL: 0,
    targetLocalL: 0,
    overlapBehind: authoring.dCam,
    overlapAhead: authoring.dCam,
  });
  const sourceTransitionS = sourceSeamS - authoring.transitionLead;
  const finishS = targetSeamS + authoring.finishAfterSeam;
  if (!(finishS < guide.length)) {
    throw new Error(`${authoring.id} finish must lie before the open successor endpoint`);
  }

  return Object.freeze({
    guide,
    chart,
    roadView,
    surfaceMap,
    groundProfile,
    link,
    sourceTransitionS,
    sourceSeamS,
    targetSeamS,
    finishS,
  });
}

function assertAuthoring(authoring: RasterSuccessorAuthoring): void {
  if (!(authoring.sourceSeamMinS > 0)) throw new RangeError('successor sourceSeamMinS must be positive');
  if (!(authoring.overlapMargin >= authoring.dCam)) throw new RangeError('successor overlapMargin must cover D_cam');
  if (!(authoring.transitionLead > 0)) throw new RangeError('successor transitionLead must be positive');
  if (!(authoring.finishAfterSeam > 0)) throw new RangeError('successor finishAfterSeam must be positive');
  if (!(authoring.deformationMeters >= 0)) throw new RangeError('successor deformationMeters must be non-negative');
  if (!(authoring.gentleTurnLimitDegrees >= 0 && authoring.gentleTurnLimitDegrees < 10)) {
    throw new RangeError('successor gentle-turn threshold must stay below the Core 10-degree limit');
  }
  if (!(authoring.minDeformationRunVertices >= 3)) {
    throw new RangeError('successor deformation run must contain at least three vertices');
  }
  if (!(authoring.dCam > 0 && authoring.dMax > authoring.dCam)) throw new RangeError('successor depth envelope is invalid');
  if (!(authoring.groundMapHalfWidth >= authoring.groundHalfWidth)) throw new RangeError('successor GroundMap must cover the local ground span');
  if (!(authoring.groundHalfWidth > authoring.roadHalfWidth)) throw new RangeError('successor ground must extend beyond road');
  if (!(authoring.roadHalfWidth > 0 && authoring.shoulderWidth >= 0)) throw new RangeError('successor road dimensions are invalid');
}

function buildOpenRunout(
  start: RasterVertex,
  heading: number,
  length: number,
  vertexCount: number,
  lateralExcursion: number,
): RasterVertex[] {
  const segmentCount = vertexCount - 1;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const normal = normalFromHeading(heading);
  const vertices: RasterVertex[] = [];
  for (let i = 1; i <= segmentCount; i += 1) {
    const phase = i / segmentCount;
    const distance = length * phase;
    const offset = lateralExcursion * Math.sin(Math.PI * phase) ** 2;
    vertices.push({
      x: start.x + forwardX * distance + normal.x * offset,
      z: start.z + forwardZ * distance + normal.z * offset,
    });
  }
  return vertices;
}

function singleRoadSurfaceBands(origin: number, authoring: RasterSuccessorAuthoring): SurfaceBand[] {
  return [
    { lMin: origin - authoring.groundHalfWidth, lMax: origin - authoring.roadHalfWidth, type: 'SHOULDER' },
    { lMin: origin - authoring.roadHalfWidth, lMax: origin + authoring.roadHalfWidth, type: 'ASPHALT' },
    { lMin: origin + authoring.roadHalfWidth, lMax: origin + authoring.groundHalfWidth, type: 'SHOULDER' },
  ];
}

function findLastVertexAtOrBefore(values: readonly number[], target: number): number {
  let found = -1;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! <= target) found = i;
    else break;
  }
  return found;
}

function copyVertex(vertex: RasterVertex): RasterVertex {
  return { x: vertex.x, z: vertex.z };
}
