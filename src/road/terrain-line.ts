import { rasterCourseToWorld, sampleRasterCourse } from '../core/course.js';
import type { GuideCurve } from '../core/guide-curve.js';
import { wrapPositive } from '../core/math.js';
import { horizonY, pseudoProject, type PseudoCamera } from '../core/projection.js';

export interface FlatRoadProfile {
  screenHeight: number;
  dMin: number;
  dMax: number;
  groundY: number;
  groundLeft: number;
  groundRight: number;
  roadLeft: number;
  roadRight: number;
}

export interface TerrainLine {
  d: number;
  s: number;
  y: number;
  xGroundL: number;
  xGroundR: number;
  xRoadL: number;
  xRoadR: number;
}

export interface ForwardVisibleInterval {
  dStart: number;
  dEnd: number;
}

const EPSILON = 1e-9;

/** Core §64 target rule: a projected segment thinner than one destination row collapses to one row. */
export const DEFAULT_THIN_SPAN_SCREEN_ROWS = 1;

export function computeForwardVisibleInterval(
  guide: GuideCurve,
  cameraYaw: number,
  sCamera: number,
  dMin: number,
  dMax: number,
): ForwardVisibleInterval | null {
  if (!(dMin > 0 && dMax > dMin && dMax < guide.length * 0.5)) {
    throw new RangeError('Core requires 0 < dMin < dMax < Lcourse/2');
  }

  const end = sCamera + dMax;
  let cursor = sCamera + dMin;

  while (cursor <= end + EPSILON) {
    const sLocal = wrapPositive(cursor, guide.length);
    const sample = sampleRasterCourse(guide.raster, sLocal);
    const facing = Math.cos(sample.heading - cameraYaw);
    if (facing <= 0) {
      const dEnd = cursor - sCamera;
      return dEnd <= dMin + EPSILON ? null : { dStart: dMin, dEnd };
    }

    const segment = guide.raster.segments[sample.segmentIndex]!;
    const localToSegmentEnd = segment.sStart + segment.length - sLocal;
    const step = Math.max(localToSegmentEnd, EPSILON);
    const next = Math.min(end, cursor + step);
    if (next >= end - EPSILON) return { dStart: dMin, dEnd: dMax };
    cursor = next;
  }

  return { dStart: dMin, dEnd: dMax };
}

export function generateFlatTerrainLines(
  guide: GuideCurve,
  camera: PseudoCamera,
  profile: FlatRoadProfile,
): TerrainLine[] {
  const visible = computeForwardVisibleInterval(
    guide,
    camera.yaw,
    camera.s,
    profile.dMin,
    profile.dMax,
  );
  if (!visible) return [];

  const h = camera.y - profile.groundY;
  const numerator = camera.focalLength * h * Math.cos(camera.pitch);
  if (!(numerator > 0)) throw new Error('flat terrain prototype requires camera above ground');

  const yHorizon = horizonY(camera);
  const lines: TerrainLine[] = [];

  for (let y = 0; y < profile.screenHeight; y += 1) {
    const sampleY = y + 0.5;
    const denominator = sampleY - yHorizon;
    if (!(denominator > 0)) continue;

    const d = numerator / denominator;
    if (d < visible.dStart || d > visible.dEnd) continue;

    const s = wrapPositive(camera.s + d, guide.length);
    const groundLeft = rasterCourseToWorld(guide.raster, s, -profile.groundLeft);
    const groundRight = rasterCourseToWorld(guide.raster, s, profile.groundRight);
    const projectedLeft = pseudoProject({ ...groundLeft, y: profile.groundY }, camera);
    const projectedRight = pseudoProject({ ...groundRight, y: profile.groundY }, camera);

    const xGroundL = projectedLeft.x;
    const xGroundR = projectedRight.x;
    if (!(xGroundR > xGroundL)) continue;

    const xRoadL = lateralToScreenX(
      -profile.roadLeft,
      xGroundL,
      xGroundR,
      profile.groundLeft,
      profile.groundRight,
    );
    const xRoadR = lateralToScreenX(
      profile.roadRight,
      xGroundL,
      xGroundR,
      profile.groundLeft,
      profile.groundRight,
    );

    lines.push({
      d,
      s,
      y,
      xGroundL,
      xGroundR,
      xRoadL,
      xRoadR,
    });
  }

  return lines;
}

export function lateralToScreenX(
  l: number,
  xGroundL: number,
  xGroundR: number,
  groundLeft: number,
  groundRight: number,
): number {
  const width = groundLeft + groundRight;
  if (!(width > 0)) throw new RangeError('ground lateral width must be > 0');
  return xGroundL + ((l + groundLeft) / width) * (xGroundR - xGroundL);
}

export function screenXToLateral(
  x: number,
  xGroundL: number,
  xGroundR: number,
  groundLeft: number,
  groundRight: number,
): number {
  const dx = xGroundR - xGroundL;
  if (Math.abs(dx) < EPSILON) throw new RangeError('degenerate horizontal span');
  return -groundLeft + ((x - xGroundL) / dx) * (groundLeft + groundRight);
}

import type { CyclicHeightProfile } from '../visual/height-profile.js';
import type { CyclicVisualProfile, GroundBase } from '../visual/visual-profile.js';

export interface TerrainVisualProfile {
  screenHeight: number;
  dMin: number;
  dMax: number;
  groundLeft: number;
  groundRight: number;
  roadLeft: number;
  roadRight: number;
  height: CyclicHeightProfile;
  visual: CyclicVisualProfile;
  /** Core §64 epsilon_span in destination scanline units. Defaults to one row. */
  thinSpanScreenRows?: number;
}

export interface TerrainLineSourceFootprint {
  /** Core §25 ordinary vertical source footprint for one output scanline. */
  deltaS: number;
  /** Core §64 clipped chainage interval represented by a collapsed row. */
  deltaSCollapse: number;
  /** max(deltaS, deltaSCollapse), authoritative for shared GroundMap LOD. */
  deltaSEffective: number;
  /** Exact one-output-pixel lateral footprint from the scanline affine mapping. */
  deltaL: number;
  collapsed: boolean;
}

export interface M3TerrainLine extends TerrainLine {
  groundBaseLeft: GroundBase;
  groundBaseRight: GroundBase;
  sectionName: string;
  renderHeight: number;
  sourceFootprint: TerrainLineSourceFootprint;
}

interface VerticalFootprintSetup {
  deltaS: number;
  deltaSCollapse: number;
  collapsed: boolean;
}

export function generateTerrainLines(
  guide: GuideCurve,
  camera: PseudoCamera,
  profile: TerrainVisualProfile,
): M3TerrainLine[] {
  const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, profile.dMin, profile.dMax);
  if (!visible) return [];

  const thinSpanScreenRows = profile.thinSpanScreenRows ?? DEFAULT_THIN_SPAN_SCREEN_ROWS;
  if (!(thinSpanScreenRows > 0) || !Number.isFinite(thinSpanScreenRows)) {
    throw new RangeError('thinSpanScreenRows must be finite and > 0');
  }

  const yH = horizonY(camera);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;
  const lines: M3TerrainLine[] = [];
  const start = camera.s + visible.dStart;
  const end = camera.s + visible.dEnd;
  let cursor = start;

  while (cursor < end - 1e-8) {
    const local = wrapPositive(cursor, guide.length);
    const raster = sampleRasterCourse(guide.raster, local);
    const rasterSegment = guide.raster.segments[raster.segmentIndex]!;
    const rasterDistance = rasterSegment.sStart + rasterSegment.length - local;
    const heightDistance = profile.height.distanceToNextRenderNode(local);
    const visualDistance = profile.visual.distanceToNextSection(local);
    const intervalLength = Math.min(rasterDistance, heightDistance, visualDistance, end - cursor);
    if (!(intervalLength > 1e-8)) {
      cursor += 1e-7;
      continue;
    }

    const d0 = cursor - camera.s;
    const d1 = d0 + intervalLength;
    const heightStart = profile.height.sampleRender(local);
    const grade = heightStart.grade;
    const yIntercept = heightStart.y - grade * d0;
    const aY = yH - f * grade * cosPitch;
    const bY = -f * (yIntercept - camera.y) * cosPitch;
    const y0 = aY + bY / d0;
    const y1 = aY + bY / d1;
    const projectedSpanRows = projectedTerrainSpanRows(bY, d0, d1);

    if (projectedSpanRows < thinSpanScreenRows) {
      // y is affine in u=1/d, so use the u-midpoint as the representative sample.
      const d = 2 / (1 / d0 + 1 / d1);
      const representativeY = (y0 + y1) * 0.5;
      const y = Math.floor(representativeY);
      if (y >= 0 && y < profile.screenHeight) {
        const deltaS = computeTerrainRowDeltaS(y, aY, bY, visible.dStart, visible.dEnd);
        const line = createM3TerrainLine(
          guide,
          camera,
          profile,
          d,
          y,
          { deltaS, deltaSCollapse: intervalLength, collapsed: true },
        );
        if (line) lines.push(line);
      }
    } else {
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      const rowStart = Math.max(0, Math.ceil(minY - 0.5 - 1e-9));
      const rowEnd = Math.min(profile.screenHeight - 1, Math.floor(maxY - 0.5 + 1e-9));

      for (let y = rowStart; y <= rowEnd; y += 1) {
        const sampleY = y + 0.5;
        const denom = sampleY - aY;
        if (Math.abs(denom) < 1e-10) continue;
        const d = bY / denom;
        if (d < d0 - 1e-7 || d > d1 + 1e-7) continue;
        if (d < visible.dStart - 1e-7 || d > visible.dEnd + 1e-7) continue;
        const deltaS = computeTerrainRowDeltaS(y, aY, bY, visible.dStart, visible.dEnd);
        const line = createM3TerrainLine(
          guide,
          camera,
          profile,
          d,
          y,
          { deltaS, deltaSCollapse: 0, collapsed: false },
        );
        if (line) lines.push(line);
      }
    }

    cursor += intervalLength;
  }

  // Core Painter order. Hills/dips may produce multiple TerrainLines on the same output row.
  lines.sort((a, b) => b.d - a.d || a.y - b.y);
  return lines;
}

/** Core §64: projected vertical span of one clipped segment in destination-row units. */
export function projectedTerrainSpanRows(bY: number, d0: number, d1: number): number {
  if (!Number.isFinite(bY)) throw new RangeError('bY must be finite');
  if (!(d0 > 0) || !(d1 > d0) || !Number.isFinite(d0) || !Number.isFinite(d1)) {
    throw new RangeError('projected terrain span requires finite 0 < d0 < d1');
  }
  return Math.abs(bY) * Math.abs(1 / d0 - 1 / d1);
}

/**
 * Core §25: Delta s = |s(y+0.5)-s(y-0.5)|. For integer row y,
 * those pixel boundaries are screen coordinates y and y+1.
 * The footprint is clipped only by the current forward near/far interval.
 */
export function computeTerrainRowDeltaS(
  row: number,
  aY: number,
  bY: number,
  dMin: number,
  dMax: number,
): number {
  if (!Number.isFinite(row) || !Number.isFinite(aY) || !Number.isFinite(bY)) {
    throw new RangeError('terrain footprint inputs must be finite');
  }
  if (!(dMin > 0 && dMax > dMin)) throw new RangeError('terrain footprint requires 0 < dMin < dMax');
  if (Math.abs(bY) < 1e-12) return 0;

  const dTop = depthAtScreenBoundary(row, aY, bY, dMin, dMax);
  const dBottom = depthAtScreenBoundary(row + 1, aY, bY, dMin, dMax);
  return Math.abs(dTop - dBottom);
}

function depthAtScreenBoundary(
  screenY: number,
  aY: number,
  bY: number,
  dMin: number,
  dMax: number,
): number {
  const denom = screenY - aY;
  if (Math.abs(denom) < 1e-12) return dMax;
  const d = bY / denom;
  // Crossing the positive-depth asymptote means the footprint extends toward infinity;
  // the renderer's actual source interval is clipped at dMax.
  if (!(d > 0) || !Number.isFinite(d)) return dMax;
  return Math.min(dMax, Math.max(dMin, d));
}

function createM3TerrainLine(
  guide: GuideCurve,
  camera: PseudoCamera,
  profile: TerrainVisualProfile,
  d: number,
  y: number,
  verticalFootprint: VerticalFootprintSetup,
): M3TerrainLine | null {
  const sUnwrapped = camera.s + d;
  const s = wrapPositive(sUnwrapped, guide.length);
  const renderHeight = profile.height.sampleRender(s).y;
  const groundLeft = rasterCourseToWorld(guide.raster, s, -profile.groundLeft);
  const groundRight = rasterCourseToWorld(guide.raster, s, profile.groundRight);
  const projectedLeft = pseudoProject({ ...groundLeft, y: renderHeight }, camera);
  const projectedRight = pseudoProject({ ...groundRight, y: renderHeight }, camera);
  const groundSpan = projectedRight.x - projectedLeft.x;
  if (!(groundSpan > 1e-7)) return null;

  const section = profile.visual.sample(s);
  const xRoadL = lateralToScreenX(-profile.roadLeft, projectedLeft.x, projectedRight.x, profile.groundLeft, profile.groundRight);
  const xRoadR = lateralToScreenX(profile.roadRight, projectedLeft.x, projectedRight.x, profile.groundLeft, profile.groundRight);
  const deltaL = (profile.groundLeft + profile.groundRight) / groundSpan;
  const deltaSEffective = Math.max(verticalFootprint.deltaS, verticalFootprint.deltaSCollapse);

  return {
    d,
    s,
    y,
    xGroundL: projectedLeft.x,
    xGroundR: projectedRight.x,
    xRoadL,
    xRoadR,
    groundBaseLeft: section.groundBaseLeft,
    groundBaseRight: section.groundBaseRight,
    sectionName: section.name,
    renderHeight,
    sourceFootprint: {
      deltaS: verticalFootprint.deltaS,
      deltaSCollapse: verticalFootprint.deltaSCollapse,
      deltaSEffective,
      deltaL,
      collapsed: verticalFootprint.collapsed,
    },
  };
}
