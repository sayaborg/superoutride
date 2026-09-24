import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfilePolylineReader } from '../course/geometry/profile.js';
import { stationIndexAt } from '../course/geometry/station-sequence.js';
import { horizonY, pseudoProject, type PseudoCamera } from './projection.js';
import { PIXEL_EDGE_TOLERANCE } from './pixel-coverage.js';
import type { VisualProfileReader } from '../course/visual-profile.js';

// Metres: chainage subtraction budget, ~eight ulps at 10^6 m; rejects numerically empty intervals.
const VISIBLE_INTERVAL_TOLERANCE_METERS = 1e-9;
// Pixels: row inversion conditioning floor; ~1,760 ulps at 320 px.
// Avoids amplifying screen-coordinate cancellation by more than 10^10 /px.
const ROW_SAMPLE_DENOMINATOR_TOLERANCE_PIXELS = 1e-10;
// Metres: 0.1 micrometre admission budget for bY/(row-aY) inversion at interval edges.
// Larger than direct chainage roundoff because the inverse divides by a screen-space difference.
const DEPTH_INTERVAL_TOLERANCE_METERS = 1e-7;
// Pixel-metres: cancellation floor in f*(heightIntercept-cameraY)*cos(pitch).
// Below it the vertical span is <4e-13 px at the 2.5 m near plane; use zero footprint.
const FLAT_HEIGHT_COEFFICIENT_TOLERANCE_PIXEL_METERS = 1e-12;
// Pixels: boundary inversion floor, ~18 ulps at 320 px; caps reciprocal gain at 10^12 /px.
// Unlike row-center admission, this clips an asymptotic footprint to the far depth.
const BOUNDARY_DENOMINATOR_TOLERANCE_PIXELS = 1e-12;
// Pixels: lateral inversion floor for the projected two-metre span; deltaL is then <2e7 m/px.
// Below this subpixel resolution budget the nearly edge-on row has no stable lateral sampling.
const MIN_TERRAIN_SPAN_PIXELS = 1e-7;

interface TerrainLineGeometry {
  d: number;
  s: number;
  y: number;
  xGroundL: number;
  xGroundR: number;
}

interface ForwardVisibleInterval {
  dStart: number;
  dEnd: number;
}

/** Thin-span target rule: a projected segment thinner than one destination row collapses to one row. */
const DEFAULT_THIN_SPAN_SCREEN_ROWS = 1;

/**
 * Determine the ordinary forward renderer interval on the authoritative plan.
 *
 * The path endpoint is a geometry boundary, not a topology seam: the visible
 * interval simply ends there. Product courses author sufficient run-in/runout
 * so this clipping is not an ordinary gameplay special case.
 */
export function computeForwardVisibleInterval(
  plan: { readonly coordinates: PlanCoordinateReader },
  extent: { readonly start: number; readonly end: number },
  cameraYaw: number,
  sCamera: number,
  dMin: number,
  dMax: number,
  out = { dStart: 0, dEnd: 0 },
): ForwardVisibleInterval | null {
  if (!(dMin > 0 && dMax > dMin) || !Number.isFinite(dMin) || !Number.isFinite(dMax)) {
    throw new RangeError('renderer requires finite 0 < dMin < dMax');
  }
  if (!Number.isFinite(sCamera)) return null;
  const dStart = Math.max(dMin, extent.start - sCamera);
  const dEnd = Math.min(dMax, extent.end - sCamera);
  if (dEnd <= dStart + VISIBLE_INTERVAL_TOLERANCE_METERS) return null;

  const end = sCamera + dEnd;
  const start = sCamera + dStart;
  const facingEnd = plan.coordinates.forwardEnd(start, end, cameraYaw) - sCamera;
  if (facingEnd <= dStart + VISIBLE_INTERVAL_TOLERANCE_METERS) return null;

  out.dStart = dStart;
  out.dEnd = facingEnd;
  return out;
}

export interface TerrainRenderParameters {
  extent: { readonly start: number; readonly end: number };
  screenHeight: number;
  dMin: number;
  dMax: number;
  height: ProfilePolylineReader;
  visual: VisualProfileReader;
  /** Collapse threshold in destination scanline units. Defaults to one row. */
  thinSpanScreenRows?: number;
}

interface TerrainLineFootprint {
  /** Ordinary vertical native footprint for one output scanline. */
  deltaS: number;
  /** Clipped chainage interval represented by a collapsed row. */
  deltaSCollapse: number;
  /** max(deltaS, deltaSCollapse), authoritative for Band sampling. */
  deltaSEffective: number;
  /** Exact one-output-pixel lateral footprint from the scanline affine mapping. */
  deltaL: number;
  collapsed: boolean;
}

interface TerrainLine extends TerrainLineGeometry {
  sectionName: string;
  renderHeight: number;
  footprint: TerrainLineFootprint;
}

/** Reused by one renderer; outputs are borrowed until its next render. */
export function createTerrainWorkspace() {
  const point = () => ({ x: 0, z: 0, y: 0, s: 0, l: 0, heading: 0, segmentIndex: -1 });
  const projection = () => ({ x: 0, y: 0, scale: 0, depth: 0, cameraRightDistance: 0 });
  return {
    lines: [] as TerrainLine[],
    pool: [] as TerrainLine[],
    boundaries: [] as number[],
    visible: { dStart: 0, dEnd: 0 },
    height: { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 },
    left: point(),
    right: point(),
    projectedLeft: projection(),
    projectedRight: projection(),
  };
}
type TerrainWorkspace = ReturnType<typeof createTerrainWorkspace>;
const ascending = (a: number, b: number) => a - b;
const painterOrder = (a: TerrainLine, b: TerrainLine) => b.d - a.d || a.y - b.y;

export function generateTerrainLines(
  plan: { readonly coordinates: PlanCoordinateReader },
  camera: PseudoCamera,
  parameters: TerrainRenderParameters,
  workspace = createTerrainWorkspace(),
): TerrainLine[] {
  const { lines, boundaries } = workspace;
  lines.length = 0;
  boundaries.length = 0;
  const visible = computeForwardVisibleInterval(
    plan,
    parameters.extent,
    camera.yaw,
    camera.s,
    parameters.dMin,
    parameters.dMax,
    workspace.visible,
  );
  if (!visible) return lines;

  const thinSpanScreenRows = parameters.thinSpanScreenRows ?? DEFAULT_THIN_SPAN_SCREEN_ROWS;
  if (!(thinSpanScreenRows > 0) || !Number.isFinite(thinSpanScreenRows)) {
    throw new RangeError('thinSpanScreenRows must be finite and > 0');
  }

  const yH = horizonY(camera);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;
  const start = camera.s + visible.dStart;
  const end = camera.s + visible.dEnd;
  // Use boundary stations directly: rounding cannot strand a cursor before a vertex.
  boundaries.push(start, end);
  appendVisibleBoundaries(boundaries, parameters.height.vertices, 's', start, end);
  appendVisibleBoundaries(boundaries, parameters.visual.sections, 'sStart', start, end);
  boundaries.sort(ascending);
  let count = 0;
  for (let i = 0; i < boundaries.length; i++)
    if (count === 0 || boundaries[i]! > boundaries[count - 1]!) boundaries[count++] = boundaries[i]!;
  boundaries.length = count;
  const distinct = boundaries;
  for (let index = 0; index + 1 < distinct.length; index += 1) {
    const local = distinct[index]!;
    const intervalEnd = distinct[index + 1]!;
    const intervalLength = intervalEnd - local;
    const d0 = local - camera.s;
    const d1 = intervalEnd - camera.s;
    const heightStart = parameters.height.sample(local, workspace.height);
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
      if (y >= 0 && y < parameters.screenHeight) {
        const deltaS = computeTerrainRowDeltaS(y, aY, bY, visible.dStart, visible.dEnd);
        const line = createTerrainLine(plan, camera, parameters, d, y, deltaS, intervalLength, true, workspace);
        if (line) lines.push(line);
      }
    } else {
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      const rowStart = Math.max(0, Math.ceil(minY - 0.5 - PIXEL_EDGE_TOLERANCE));
      const rowEnd = Math.min(parameters.screenHeight - 1, Math.floor(maxY - 0.5 + PIXEL_EDGE_TOLERANCE));

      for (let y = rowStart; y <= rowEnd; y += 1) {
        const sampleY = y + 0.5;
        const denom = sampleY - aY;
        if (Math.abs(denom) < ROW_SAMPLE_DENOMINATOR_TOLERANCE_PIXELS) continue;
        const d = bY / denom;
        if (d < d0 - DEPTH_INTERVAL_TOLERANCE_METERS || d > d1 + DEPTH_INTERVAL_TOLERANCE_METERS) continue;
        if (d < visible.dStart - DEPTH_INTERVAL_TOLERANCE_METERS || d > visible.dEnd + DEPTH_INTERVAL_TOLERANCE_METERS)
          continue;
        const deltaS = computeTerrainRowDeltaS(y, aY, bY, visible.dStart, visible.dEnd);
        const line = createTerrainLine(plan, camera, parameters, d, y, deltaS, 0, false, workspace);
        if (line) lines.push(line);
      }
    }
  }

  // Core Painter order. Hills/dips may produce multiple TerrainLines on the same output row.
  lines.sort(painterOrder);
  return lines;
}

/** Projected vertical span of one clipped segment in destination-row units. */
function projectedTerrainSpanRows(bY: number, d0: number, d1: number): number {
  if (!Number.isFinite(bY)) throw new RangeError('bY must be finite');
  if (!(d0 > 0) || !(d1 > d0) || !Number.isFinite(d0) || !Number.isFinite(d1)) {
    throw new RangeError('projected terrain span requires finite 0 < d0 < d1');
  }
  return Math.abs(bY) * Math.abs(1 / d0 - 1 / d1);
}

/**
 * For integer output row y, Delta s = |s(y+1)-s(y)| at its screen boundaries.
 * The footprint is clipped only by the current forward near/far interval.
 */
function computeTerrainRowDeltaS(row: number, aY: number, bY: number, dMin: number, dMax: number): number {
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
  plan: { readonly coordinates: PlanCoordinateReader },
  camera: PseudoCamera,
  parameters: TerrainRenderParameters,
  d: number,
  y: number,
  deltaS: number,
  deltaSCollapse: number,
  collapsed: boolean,
  workspace: TerrainWorkspace,
): TerrainLine | null {
  const s = camera.s + d;
  const renderHeight = parameters.height.sample(s, workspace.height).y;
  plan.coordinates.toWorld(s, -1, workspace.left);
  plan.coordinates.toWorld(s, 1, workspace.right);
  workspace.left.y = renderHeight;
  workspace.right.y = renderHeight;
  const projectedLeft = pseudoProject(workspace.left, camera, workspace.projectedLeft);
  const projectedRight = pseudoProject(workspace.right, camera, workspace.projectedRight);
  const groundSpan = projectedRight.x - projectedLeft.x;
  if (!(groundSpan > MIN_TERRAIN_SPAN_PIXELS)) return null;

  const section = parameters.visual.sample(s);
  const deltaL = 2 / groundSpan;
  let line = workspace.pool[workspace.lines.length];
  if (!line) {
    line = {
      d: 0,
      s: 0,
      y: 0,
      xGroundL: 0,
      xGroundR: 0,
      sectionName: '',
      renderHeight: 0,
      footprint: { deltaS: 0, deltaSCollapse: 0, deltaSEffective: 0, deltaL: 0, collapsed: false },
    };
    workspace.pool.push(line);
  }
  line.d = d;
  line.s = s;
  line.y = y;
  line.xGroundL = projectedLeft.x;
  line.xGroundR = projectedRight.x;
  line.sectionName = section.name;
  line.renderHeight = renderHeight;
  line.footprint.deltaS = deltaS;
  line.footprint.deltaSCollapse = deltaSCollapse;
  line.footprint.deltaSEffective = Math.max(deltaS, deltaSCollapse);
  line.footprint.deltaL = deltaL;
  line.footprint.collapsed = collapsed;
  return line;
}

/** Binary entry lookup bounds work by visible intervals, not total course length. */
function appendVisibleBoundaries<T, K extends keyof T>(
  out: number[],
  entries: readonly T[],
  key: K,
  start: number,
  end: number,
): void {
  for (let i = stationIndexAt(entries, key, start) + 1; i < entries.length; i += 1) {
    const s = entries[i]![key] as number;
    if (s >= end) break;
    out.push(s);
  }
}
