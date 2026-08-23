import { compileRasterCourse, type RasterCourse, type RasterVertex } from '../core/course.js';
import { compileGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { normalFromHeading, wrapAngle } from '../core/math.js';
import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import { createGuideChart } from '../gameplay/guide-chart.js';
import { StageSurfaceMapView } from '../physics/stage-surface-map-view.js';
import { CyclicSurfaceMap, type SurfaceBand } from '../physics/surface-map.js';
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
  readonly finishClosureMargin: number;
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
 * Build one independent closed Raster/Guide successor from an already compiled stage.
 *
 * The source overlap is copied exactly. New geometry is introduced only on the longest run whose
 * source Raster vertex turns are below the authored gentle-turn threshold. The final Raster is
 * always passed through compileRasterCourse(), so the existing Core <=10° turn limit remains the
 * authority and cannot be widened by this factory.
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
  if (sourceStartIndex <= 0 || sharedEndIndex < 0) {
    throw new RangeError(`${authoring.id} source lacks successor overlap envelope`);
  }

  const prefix = raster.vertices.slice(sourceStartIndex, sharedEndIndex + 1).map(copyVertex);
  const tailIndices = [
    ...range(sharedEndIndex + 1, raster.vertices.length),
    ...range(0, sourceStartIndex),
  ];
  const gentleRun = longestGentleRun(raster, tailIndices, authoring.gentleTurnLimitDegrees);
  if (gentleRun.length < authoring.minDeformationRunVertices) {
    throw new Error(`${authoring.id} successor lacks a safe low-curvature deformation run`);
  }

  const tail = tailIndices.map((sourceIndex, tailIndex) => {
    const vertex = raster.vertices[sourceIndex]!;
    if (tailIndex < gentleRun.start || tailIndex >= gentleRun.start + gentleRun.length) return copyVertex(vertex);
    const localIndex = tailIndex - gentleRun.start;
    const phase = gentleRun.length === 1 ? 0 : localIndex / (gentleRun.length - 1);
    const smooth = Math.sin(Math.PI * phase) ** 2;
    const heading = raster.segments[sourceIndex]!.heading;
    const normal = normalFromHeading(heading);
    const offset = authoring.deformationDirection * authoring.deformationMeters * smooth;
    return { x: vertex.x + normal.x * offset, z: vertex.z + normal.z * offset };
  });

  const successorRaster = compileRasterCourse([...prefix, ...tail]);
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
  const sourceSurfaceMap = new CyclicSurfaceMap(guide.length, [{
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
  if (!(finishS < guide.length - authoring.finishClosureMargin)) {
    throw new Error(`${authoring.id} finish must precede successor closure seam`);
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
  if (!(authoring.minDeformationRunVertices >= 2)) throw new RangeError('successor deformation run must contain at least two vertices');
  if (!(authoring.dCam > 0 && authoring.dMax > authoring.dCam)) throw new RangeError('successor depth envelope is invalid');
  if (!(authoring.groundMapHalfWidth >= authoring.groundHalfWidth)) throw new RangeError('successor GroundMap must cover the local ground span');
  if (!(authoring.groundHalfWidth > authoring.roadHalfWidth)) throw new RangeError('successor ground must extend beyond road');
  if (!(authoring.roadHalfWidth > 0 && authoring.shoulderWidth >= 0)) throw new RangeError('successor road dimensions are invalid');
}

function longestGentleRun(
  raster: RasterCourse,
  indices: readonly number[],
  turnLimitDegrees: number,
): { readonly start: number; readonly length: number } {
  let bestStart = 0;
  let bestLength = 0;
  let currentStart = 0;
  let currentLength = 0;
  for (let i = 0; i < indices.length; i += 1) {
    if (vertexTurnDegrees(raster, indices[i]!) <= turnLimitDegrees) {
      if (currentLength === 0) currentStart = i;
      currentLength += 1;
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentLength = 0;
    }
  }
  return { start: bestStart, length: bestLength };
}

function vertexTurnDegrees(raster: RasterCourse, vertexIndex: number): number {
  const n = raster.segments.length;
  const incoming = raster.segments[(vertexIndex - 1 + n) % n]!.heading;
  const outgoing = raster.segments[vertexIndex]!.heading;
  return Math.abs(wrapAngle(outgoing - incoming)) * 180 / Math.PI;
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

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
}

function copyVertex(vertex: RasterVertex): RasterVertex {
  return { x: vertex.x, z: vertex.z };
}
