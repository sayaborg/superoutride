import {
  classifyStageRoadLocalL,
  stageRoadSourceLateral,
  type StageRoadView,
} from '../course/stage-road-view.js';
import {
  SURFACE_MATERIALS,
  type CyclicSurfaceMap,
  type SurfaceSample,
} from './surface-map.js';

/**
 * Read-only stage-local SurfaceMap adapter.
 *
 * ROAD/TERRAIN reuse parent-authored physical content through the same lateral translation as the
 * GroundMap view. SHOULDER is local stage authority, so a former median-facing edge becomes a normal
 * supported shoulder after handoff. Anything outside the committed stage corridor is physically VOID.
 */
export class StageSurfaceMapView {
  constructor(
    readonly source: CyclicSurfaceMap,
    readonly roadView: StageRoadView,
  ) {}

  sample(s: number, localL: number): SurfaceSample {
    const localClass = classifyStageRoadLocalL(this.roadView, localL);
    if (localClass === 'OUTSIDE') {
      return {
        sectionName: `${this.source.sectionAt(s).name} / STAGE OUTSIDE`,
        type: 'VOID',
        material: SURFACE_MATERIALS.VOID,
      };
    }
    if (localClass === 'SHOULDER') {
      return {
        sectionName: `${this.source.sectionAt(s).name} / STAGE SHOULDER`,
        type: 'SHOULDER',
        material: SURFACE_MATERIALS.SHOULDER,
      };
    }
    return this.source.sample(s, stageRoadSourceLateral(this.roadView, localL));
  }
}
