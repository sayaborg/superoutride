import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import { classifyStageRoadLocalL, type StageRoadView } from '../course/stage-road-view.js';
import { wrapPositive } from '../core/math.js';
import {
  SURFACE_MATERIALS,
  type SurfaceMapReader,
  type SurfaceSample,
  type SurfaceType,
} from './surface-map.js';

export type StageJunctionOuterSurfaceType = Extract<SurfaceType, 'GRASS' | 'DIRT' | 'SAND' | 'VOID'>;

/**
 * Stage-local physical SurfaceMap for a visible two-way junction.
 *
 * The JunctionCrossSectionProfile is evaluated in the active stage chart: l=0 is the incoming
 * stage road center regardless of the Raster source lateral origin. The expanded stage ground
 * envelope is the only physical boundary; inside it, the junction owns road/shoulder/median
 * semantics and the remaining terrain uses one explicit authored material.
 */
export class StageJunctionSurfaceMap implements SurfaceMapReader {
  constructor(
    readonly courseLength: number,
    readonly roadView: StageRoadView,
    readonly junction: JunctionCrossSectionProfile,
    readonly sectionName: string,
    readonly outerSurfaceType: StageJunctionOuterSurfaceType = 'GRASS',
  ) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('stage junction SurfaceMap courseLength must be finite and > 0');
    }
    if (sectionName.trim().length === 0) {
      throw new RangeError('stage junction SurfaceMap sectionName must not be empty');
    }
  }

  sample(s: number, localL: number): SurfaceSample {
    const localS = wrapPositive(s, this.courseLength);
    if (classifyStageRoadLocalL(this.roadView, localL) === 'OUTSIDE') {
      return sample('VOID', `${this.sectionName} / OUTSIDE`);
    }

    const junctionClass = this.junction.classify(localS, localL);
    if (
      junctionClass === 'ASPHALT_SINGLE'
      || junctionClass === 'ASPHALT_LEFT'
      || junctionClass === 'ASPHALT_RIGHT'
    ) return sample('ASPHALT', `${this.sectionName} / JUNCTION`);
    if (junctionClass === 'SHOULDER') return sample('SHOULDER', `${this.sectionName} / JUNCTION`);
    if (junctionClass === 'MEDIAN') return sample('GRASS', `${this.sectionName} / JUNCTION MEDIAN`);
    return sample(this.outerSurfaceType, `${this.sectionName} / TERRAIN`);
  }
}

function sample(type: SurfaceType, sectionName: string): SurfaceSample {
  return { sectionName, type, material: SURFACE_MATERIALS[type] };
}
