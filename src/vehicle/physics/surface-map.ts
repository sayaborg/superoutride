import type { SurfaceMapReader, SurfaceSample } from '../../course/vehicle-world.js';
import {
  compileStationSequence,
  stationSequenceChainage,
  stationIndexAt,
} from '../../course/geometry/station-sequence.js';
import { SURFACE_MATERIALS, type SurfaceType } from '../../course/surface-material.js';

// Metres: 1 nm boundary-arithmetic budget (~eight ulps at 10^6 m) for interval admission.
// This does not snap sampled lateral coordinates or change interval membership.
const SURFACE_INTERVAL_OVERLAP_TOLERANCE_METERS = 1e-9;

interface SurfaceInterval {
  readonly lMin: number;
  readonly lMax: number;
  readonly type: Exclude<SurfaceType, 'VOID'>;
}

interface SurfaceSection {
  readonly sStart: number;
  readonly name: string;
  readonly intervals: readonly SurfaceInterval[];
}

/**
 * General runtime SurfaceMap(s,l): an open [0, courseLength] chainage domain containing
 * piecewise-constant authored terrain.
 * Visual Strip colors remain independent.
 */
export class SurfaceMap implements SurfaceMapReader {
  readonly sections: readonly SurfaceSection[];

  constructor(
    readonly courseLength: number,
    sections: readonly SurfaceSection[],
  ) {
    this.sections = compileStationSequence(
      sections.map((section) => ({
        ...section,
        intervals: compileSurfaceIntervals(section.intervals),
      })),
      { length: courseLength, chainage: 'sStart' },
    );
  }

  sample(s: number, l: number): SurfaceSample {
    if (!Number.isFinite(l)) throw new RangeError('surface lateral coordinate must be finite');
    const local = this.normalizeChainage(s);
    const section = this.sectionAtLocal(local);

    for (let i = 0; i < section.intervals.length; i += 1) {
      const interval = section.intervals[i]!;
      if (l >= interval.lMin && l <= interval.lMax) {
        const material = SURFACE_MATERIALS[interval.type];
        return { type: interval.type, material };
      }
    }
    return { type: 'VOID', material: SURFACE_MATERIALS.VOID };
  }

  sectionAt(s: number): SurfaceSection {
    return this.sectionAtLocal(this.normalizeChainage(s));
  }

  private normalizeChainage(s: number): number {
    return stationSequenceChainage(s, this.courseLength);
  }

  private sectionAtLocal(local: number): SurfaceSection {
    return this.sections[stationIndexAt(this.sections, 'sStart', local)]!;
  }
}

/** One physical-interval compiler for both physical authoring and runtime SurfaceMap sources. */
function compileSurfaceIntervals(intervals: readonly SurfaceInterval[]): readonly SurfaceInterval[] {
  const copied = intervals.map((interval) => ({ ...interval })).sort((a, b) => a.lMin - b.lMin);
  for (let i = 0; i < copied.length; i += 1) {
    const interval = copied[i]!;
    if (!Number.isFinite(interval.lMin) || !Number.isFinite(interval.lMax) || !(interval.lMax > interval.lMin)) {
      throw new RangeError('surface interval must have finite positive width');
    }
    if (!Object.hasOwn(SURFACE_MATERIALS, interval.type) || !SURFACE_MATERIALS[interval.type].supported) {
      throw new RangeError('surface interval must name a supported material');
    }
    if (i > 0 && interval.lMin < copied[i - 1]!.lMax - SURFACE_INTERVAL_OVERLAP_TOLERANCE_METERS) {
      throw new Error('surface intervals must not overlap');
    }
  }
  return Object.freeze(copied.map((interval) => Object.freeze(interval)));
}
