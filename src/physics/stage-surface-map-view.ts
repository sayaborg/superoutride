import { stageRoadSourceLateral, type StageRoadView } from '../course/stage-road-view.js';
import type { CyclicSurfaceMap, SurfaceSample } from './surface-map.js';

/**
 * Read-only stage-local SurfaceMap adapter. It never changes SurfaceMap authoring or vehicle state;
 * local l is translated into the shared parent-authored source coordinate exactly once.
 */
export class StageSurfaceMapView {
  constructor(
    readonly source: CyclicSurfaceMap,
    readonly roadView: StageRoadView,
  ) {}

  sample(s: number, localL: number): SurfaceSample {
    return this.source.sample(s, stageRoadSourceLateral(this.roadView, localL));
  }
}
