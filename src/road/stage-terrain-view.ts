import type { GuideCurve } from '../core/guide-curve.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import { stageRoadToWorld, type StageRoadView } from '../course/stage-road-view.js';
import type { M3TerrainLine } from './terrain-line.js';

/**
 * Re-express one already chainage-selected TerrainLine through a stage-local lateral road view.
 *
 * d, s, y, render height and vertical source footprint are untouched. Only the affine horizontal
 * strip changes. This preserves the one-chainage/one-scanline pseudo-3D core while allowing a
 * committed child stage to draw one selected road centered on its own local l=0.
 */
export function applyStageRoadViewToTerrainLine(
  guide: GuideCurve,
  camera: PseudoCamera,
  line: M3TerrainLine,
  view: StageRoadView,
): M3TerrainLine | null {
  const groundLeft = stageRoadToWorld(guide.raster, view, line.s, -view.groundLeft);
  const groundRight = stageRoadToWorld(guide.raster, view, line.s, view.groundRight);
  const roadLeft = stageRoadToWorld(guide.raster, view, line.s, -view.roadLeft);
  const roadRight = stageRoadToWorld(guide.raster, view, line.s, view.roadRight);

  const projectedGroundLeft = pseudoProject({ ...groundLeft, y: line.renderHeight }, camera);
  const projectedGroundRight = pseudoProject({ ...groundRight, y: line.renderHeight }, camera);
  const projectedRoadLeft = pseudoProject({ ...roadLeft, y: line.renderHeight }, camera);
  const projectedRoadRight = pseudoProject({ ...roadRight, y: line.renderHeight }, camera);
  const groundSpan = projectedGroundRight.x - projectedGroundLeft.x;
  if (!(groundSpan > 1e-7)) return null;

  return {
    ...line,
    xGroundL: projectedGroundLeft.x,
    xGroundR: projectedGroundRight.x,
    xRoadL: projectedRoadLeft.x,
    xRoadR: projectedRoadRight.x,
    sourceFootprint: {
      ...line.sourceFootprint,
      deltaL: (view.groundLeft + view.groundRight) / groundSpan,
    },
  };
}
