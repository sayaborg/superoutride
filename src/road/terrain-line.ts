import type { GuidePath } from '../core/guide-curve.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import { profileIndexAt } from '../core/open-profile.js';
import { horizonY, pseudoProject, type PseudoCamera } from '../core/projection.js';
import { rasterPathToWorld } from '../core/raster-path.js';
import { PIXEL_EDGE_TOLERANCE, SOURCE_ENDPOINT_TOLERANCE_METERS } from '../core/tolerances.js';
import type { GroundBase, VisualProfileReader } from '../visual/visual-profile.js';

const VISIBLE_INTERVAL_TOLERANCE_METERS = 1e-9;
const MIN_INVERTIBLE_SPAN_PIXELS = 1e-9;
const ROW_SAMPLE_DENOMINATOR_TOLERANCE_PIXELS = 1e-10;
const DEPTH_INTERVAL_TOLERANCE_METERS = 1e-7;
const FLAT_HEIGHT_COEFFICIENT_TOLERANCE_PIXEL_METERS = 1e-12;
const BOUNDARY_DENOMINATOR_TOLERANCE_PIXELS = 1e-12;
export const MIN_TERRAIN_SPAN_PIXELS = 1e-7;

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

export interface TerrainLineGeometry {
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

/** Thin-span target rule: a projected segment thinner than one destination row collapses to one row. */
export const DEFAULT_THIN_SPAN_SCREEN_ROWS = 1;

/**
 * Determine the ordinary forward renderer interval on one open GuidePath.
 *
 * The path endpoint is a geometry boundary, not a topology seam: the visible
 * interval simply ends there. Product courses author sufficient run-in/runout
 * so this clipping is not an ordinary gameplay special case.
 */
export function computeForwardVisibleInterval(
  guide: GuidePath,
  cameraYaw: number,
  sCamera: number,
  dMin: number,
  dMax: number,
): ForwardVisibleInterval | null {
  if (!(dMin > 0 && dMax > dMin) || !Number.isFinite(dMin) || !Number.isFinite(dMax)) {
    throw new RangeError('renderer requires finite 0 < dMin < dMax');
  }
  if (
    !Number.isFinite(sCamera) ||
    sCamera < -SOURCE_ENDPOINT_TOLERANCE_METERS ||
    sCamera > guide.length + SOURCE_ENDPOINT_TOLERANCE_METERS
  ) {
    throw new RangeError('camera render chainage is outside the open GuidePath');
  }

  const available = Math.max(0, guide.length - Math.max(0, sCamera));
  const dEnd = Math.min(dMax, available);
  if (dEnd <= dMin + VISIBLE_INTERVAL_TOLERANCE_METERS) return null;

  const end = sCamera + dEnd;
  const start = sCamera + dMin;
  const segments = guide.raster.segments;
  for (let index = profileIndexAt(segments, 'sStart', start); index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.sStart >= end - VISIBLE_INTERVAL_TOLERANCE_METERS) break;
    const facing = Math.cos(segment.heading - cameraYaw);
    if (facing <= 0) {
      const facingEnd = Math.max(start, segment.sStart) - sCamera;
      return facingEnd <= dMin + VISIBLE_INTERVAL_TOLERANCE_METERS ? null : { dStart: dMin, dEnd: facingEnd };
    }
  }

  return { dStart: dMin, dEnd };
}

export function generateFlatTerrainLines(
  guide: GuidePath,
  camera: PseudoCamera,
  profile: FlatRoadProfile,
): TerrainLineGeometry[] {
  const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, profile.dMin, profile.dMax);
  if (!visible) return [];

  const h = camera.y - profile.groundY;
  const numerator = camera.focalLength * h * Math.cos(camera.pitch);
  if (!(numerator > 0)) throw new Error('flat terrain prototype requires camera above ground');

  const yHorizon = horizonY(camera);
  const lines: TerrainLineGeometry[] = [];

  for (let y = 0; y < profile.screenHeight; y += 1) {
    const sampleY = y + 0.5;
    const denominator = sampleY - yHorizon;
    if (!(denominator > 0)) continue;

    const d = numerator / denominator;
    if (d < visible.dStart || d > visible.dEnd) continue;

    const s = camera.s + d;
    const groundLeft = rasterPathToWorld(guide.raster, s, -profile.groundLeft);
    const groundRight = rasterPathToWorld(guide.raster, s, profile.groundRight);
    const projectedLeft = pseudoProject({ ...groundLeft, y: profile.groundY }, camera);
    const projectedRight = pseudoProject({ ...groundRight, y: profile.groundY }, camera);

    const xGroundL = projectedLeft.x;
    const xGroundR = projectedRight.x;
    if (!(xGroundR > xGroundL)) continue;

    const xRoadL = lateralToScreenX(-profile.roadLeft, xGroundL, xGroundR, profile.groundLeft, profile.groundRight);
    const xRoadR = lateralToScreenX(profile.roadRight, xGroundL, xGroundR, profile.groundLeft, profile.groundRight);

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
  if (Math.abs(dx) < MIN_INVERTIBLE_SPAN_PIXELS) throw new RangeError('degenerate horizontal span');
  return -groundLeft + ((x - xGroundL) / dx) * (groundLeft + groundRight);
}

export interface TerrainVisualProfile {
  screenHeight: number;
  dMin: number;
  dMax: number;
  groundLeft: number;
  groundRight: number;
  roadLeft: number;
  roadRight: number;
  height: HeightProfileReader;
  visual: VisualProfileReader;
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

export interface TerrainLine extends TerrainLineGeometry {
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
  guide: GuidePath,
  camera: PseudoCamera,
  profile: TerrainVisualProfile,
): TerrainLine[] {
  const visible = computeForwardVisibleInterval(guide, camera.yaw, camera.s, profile.dMin, profile.dMax);
  if (!visible) return [];

  const thinSpanScreenRows = profile.thinSpanScreenRows ?? DEFAULT_THIN_SPAN_SCREEN_ROWS;
  if (!(thinSpanScreenRows > 0) || !Number.isFinite(thinSpanScreenRows)) {
    throw new RangeError('thinSpanScreenRows must be finite and > 0');
  }

  const yH = horizonY(camera);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;
  const lines: TerrainLine[] = [];
  const start = camera.s + visible.dStart;
  const end = camera.s + visible.dEnd;
  // Use authored boundaries directly: rounding cannot strand a cursor before a vertex.
  const boundaries = [start, end];
  appendVisibleBoundaries(boundaries, guide.raster.segments, 'sStart', start, end);
  appendVisibleBoundaries(boundaries, profile.height.nodes, 's', start, end);
  appendVisibleBoundaries(boundaries, profile.visual.sections, 'sStart', start, end);
  boundaries.sort((a, b) => a - b);
  const distinct = boundaries.filter((s, index) => index === 0 || s > boundaries[index - 1]!);
  for (let index = 0; index + 1 < distinct.length; index += 1) {
    const local = distinct[index]!;
    const intervalEnd = distinct[index + 1]!;
    const intervalLength = intervalEnd - local;
    const d0 = local - camera.s;
    const d1 = intervalEnd - camera.s;
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
        const line = createTerrainLine(guide, camera, profile, d, y, {
          deltaS,
          deltaSCollapse: intervalLength,
          collapsed: true,
        });
        if (line) lines.push(line);
      }
    } else {
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      const rowStart = Math.max(0, Math.ceil(minY - 0.5 - PIXEL_EDGE_TOLERANCE));
      const rowEnd = Math.min(profile.screenHeight - 1, Math.floor(maxY - 0.5 + PIXEL_EDGE_TOLERANCE));

      for (let y = rowStart; y <= rowEnd; y += 1) {
        const sampleY = y + 0.5;
        const denom = sampleY - aY;
        if (Math.abs(denom) < ROW_SAMPLE_DENOMINATOR_TOLERANCE_PIXELS) continue;
        const d = bY / denom;
        if (d < d0 - DEPTH_INTERVAL_TOLERANCE_METERS || d > d1 + DEPTH_INTERVAL_TOLERANCE_METERS) continue;
        if (d < visible.dStart - DEPTH_INTERVAL_TOLERANCE_METERS || d > visible.dEnd + DEPTH_INTERVAL_TOLERANCE_METERS)
          continue;
        const deltaS = computeTerrainRowDeltaS(y, aY, bY, visible.dStart, visible.dEnd);
        const line = createTerrainLine(guide, camera, profile, d, y, { deltaS, deltaSCollapse: 0, collapsed: false });
        if (line) lines.push(line);
      }
    }
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
export function computeTerrainRowDeltaS(row: number, aY: number, bY: number, dMin: number, dMax: number): number {
  if (!Number.isFinite(row) || !Number.isFinite(aY) || !Number.isFinite(bY)) {
    throw new RangeError('terrain footprint inputs must be finite');
  }
  if (!(dMin > 0 && dMax > dMin)) throw new RangeError('terrain footprint requires 0 < dMin < dMax');
  if (Math.abs(bY) < FLAT_HEIGHT_COEFFICIENT_TOLERANCE_PIXEL_METERS) return 0;

  const dTop = depthAtScreenBoundary(row, aY, bY, dMin, dMax);
  const dBottom = depthAtScreenBoundary(row + 1, aY, bY, dMin, dMax);
  return Math.abs(dTop - dBottom);
}

function depthAtScreenBoundary(screenY: number, aY: number, bY: number, dMin: number, dMax: number): number {
  const denom = screenY - aY;
  if (Math.abs(denom) < BOUNDARY_DENOMINATOR_TOLERANCE_PIXELS) return dMax;
  const d = bY / denom;
  // Crossing the positive-depth asymptote means the footprint extends toward infinity;
  // the renderer's actual source interval is clipped at dMax.
  if (!(d > 0) || !Number.isFinite(d)) return dMax;
  return Math.min(dMax, Math.max(dMin, d));
}

function createTerrainLine(
  guide: GuidePath,
  camera: PseudoCamera,
  profile: TerrainVisualProfile,
  d: number,
  y: number,
  verticalFootprint: VerticalFootprintSetup,
): TerrainLine | null {
  const s = camera.s + d;
  const renderHeight = profile.height.sampleRender(s).y;
  const groundLeft = rasterPathToWorld(guide.raster, s, -profile.groundLeft);
  const groundRight = rasterPathToWorld(guide.raster, s, profile.groundRight);
  const projectedLeft = pseudoProject({ ...groundLeft, y: renderHeight }, camera);
  const projectedRight = pseudoProject({ ...groundRight, y: renderHeight }, camera);
  const groundSpan = projectedRight.x - projectedLeft.x;
  if (!(groundSpan > MIN_TERRAIN_SPAN_PIXELS)) return null;

  const section = profile.visual.sample(s);
  const xRoadL = lateralToScreenX(
    -profile.roadLeft,
    projectedLeft.x,
    projectedRight.x,
    profile.groundLeft,
    profile.groundRight,
  );
  const xRoadR = lateralToScreenX(
    profile.roadRight,
    projectedLeft.x,
    projectedRight.x,
    profile.groundLeft,
    profile.groundRight,
  );
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

/** Binary entry lookup bounds work by visible intervals, not total course length. */
function appendVisibleBoundaries<T, K extends keyof T>(
  out: number[],
  entries: readonly T[],
  key: K,
  start: number,
  end: number,
): void {
  for (let i = profileIndexAt(entries, key, start) + 1; i < entries.length; i += 1) {
    const s = entries[i]![key] as number;
    if (s >= end) break;
    out.push(s);
  }
}
