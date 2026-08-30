import type { GuideCurve } from '../core/guide-curve.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import type { VehicleKinematicState } from '../physics/vehicle-state.js';
import { generateTerrainLines, type TerrainVisualProfile } from '../road/terrain-line.js';
import { SoftwareSurface, rgba } from './software-surface.js';
import { drawFarBackground, type FarBackground } from '../visual/far-background.js';
import { sampleGroundMap, type GroundMapProfile } from '../visual/ground-map.js';

export interface M3RenderResult {
  terrainLineCount: number;
  terrainOutputPixels: number;
  overdrawRows: number;
  activeSection: string;
}

const PLAYER_COLOR = rgba(240, 209, 90);
const PLAYER_DARK = rgba(18, 23, 27);

export function renderM3VisualCore(
  target: SoftwareSurface,
  background: FarBackground,
  guide: GuideCurve,
  camera: PseudoCamera,
  vehicle: VehicleKinematicState,
  terrainProfile: TerrainVisualProfile,
  groundProfile: GroundMapProfile,
): M3RenderResult {
  drawFarBackground(target, background, camera);
  const lines = generateTerrainLines(guide, camera, terrainProfile);
  const rowCounts = new Uint16Array(target.height);
  let outputPixels = 0;

  for (const line of lines) {
    rowCounts[line.y]! += 1;
    const leftEdge = Math.ceil(line.xGroundL);
    const rightEdge = Math.floor(line.xGroundR);

    if (line.groundBaseLeft.kind === 'color') {
      const right = Math.min(target.width - 1, leftEdge - 1);
      if (right >= 0) {
        target.fillSpan(line.y, 0, right, line.groundBaseLeft.color);
        outputPixels += right + 1;
      }
    }

    const x0 = Math.max(0, leftEdge);
    const x1 = Math.min(target.width - 1, rightEdge);
    if (x1 >= x0) {
      const dx = line.xGroundR - line.xGroundL;
      let lateral = -groundProfile.groundLeft
        + ((x0 + 0.5 - line.xGroundL) / dx) * (groundProfile.groundLeft + groundProfile.groundRight);
      const lateralStep = (groundProfile.groundLeft + groundProfile.groundRight) / dx;
      const cliffSection = line.groundBaseLeft.kind === 'transparent';
      const offset = line.y * target.width;
      for (let x = x0; x <= x1; x += 1) {
        target.pixels[offset + x] = sampleGroundMap(line.s, lateral, groundProfile, cliffSection);
        lateral += lateralStep;
      }
      outputPixels += x1 - x0 + 1;
    }

    if (line.groundBaseRight.kind === 'color') {
      const left = Math.max(0, rightEdge + 1);
      if (left < target.width) {
        target.fillSpan(line.y, left, target.width - 1, line.groundBaseRight.color);
        outputPixels += target.width - left;
      }
    }
  }

  const playerY = terrainProfile.height.sampleRender(vehicle.course.s).y;
  const player = pseudoProject({ x: vehicle.x, y: playerY, z: vehicle.z, s: vehicle.course.s }, camera);
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  for (let y = py - 12; y < py; y += 1) target.fillSpan(y, px - 5, px + 5, PLAYER_COLOR);
  for (let y = py - 10; y < py - 6; y += 1) target.fillSpan(y, px - 3, px + 3, PLAYER_DARK);

  let overdrawRows = 0;
  for (const count of rowCounts) if (count > 1) overdrawRows += 1;
  const activeSection = terrainProfile.visual.sample(vehicle.course.s).name;
  return { terrainLineCount: lines.length, terrainOutputPixels: outputPixels, overdrawRows, activeSection };
}
