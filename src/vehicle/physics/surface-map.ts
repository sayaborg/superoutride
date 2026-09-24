import type { SurfaceMapReader, SurfaceSample } from '../../course/vehicle-world.js';
import { compileKnotSequence, knotSequenceChainage, knotIndexAt } from '../../course/geometry/knot-sequence.js';
import { SURFACE_MATERIALS, type SurfaceType } from '../../course/surface-material.js';

// Metres: 1 nm boundary-arithmetic budget (~eight ulps at 10^6 m) for region admission.
// This does not snap sampled lateral coordinates or change region membership.
const BAND_OVERLAP_TOLERANCE_METERS = 1e-9;

interface SurfaceRegion {
  readonly lMin: number;
  readonly lMax: number;
  readonly type: Exclude<SurfaceType, 'VOID'>;
}

interface SurfaceSection {
  readonly sStart: number;
  readonly name: string;
  readonly regions: readonly SurfaceRegion[];
}

/**
 * General runtime SurfaceMap(s,l): an open [0, courseLength] chainage domain containing
 * piecewise-constant authored terrain.
 * Visual Band colors remain independent.
 */
export class SurfaceMap implements SurfaceMapReader {
  readonly sections: readonly SurfaceSection[];

  constructor(
    readonly courseLength: number,
    sections: readonly SurfaceSection[],
  ) {
    this.sections = compileKnotSequence(
      sections.map((section) => ({
        ...section,
        regions: compileSurfaceRegions(section.regions),
      })),
      { length: courseLength, chainage: 'sStart', label: 'surface profile' },
    );
  }

  sample(s: number, l: number): SurfaceSample {
    if (!Number.isFinite(l)) throw new RangeError('surface lateral coordinate must be finite');
    const local = this.normalizeChainage(s);
    const section = this.sectionAtLocal(local);

    for (let i = 0; i < section.regions.length; i += 1) {
      const region = section.regions[i]!;
      if (l >= region.lMin && l <= region.lMax) {
        const material = SURFACE_MATERIALS[region.type];
        return { sectionName: section.name, type: region.type, material };
      }
    }
    return { sectionName: section.name, type: 'VOID', material: SURFACE_MATERIALS.VOID };
  }

  sectionAt(s: number): SurfaceSection {
    return this.sectionAtLocal(this.normalizeChainage(s));
  }

  private normalizeChainage(s: number): number {
    return knotSequenceChainage(s, this.courseLength, 'surface');
  }

  private sectionAtLocal(local: number): SurfaceSection {
    return this.sections[knotIndexAt(this.sections, 'sStart', local)]!;
  }
}

/** One physical-region compiler for both physical authoring and runtime SurfaceMap sources. */
function compileSurfaceRegions(regions: readonly SurfaceRegion[]): readonly SurfaceRegion[] {
  const copied = regions.map((region) => ({ ...region })).sort((a, b) => a.lMin - b.lMin);
  for (let i = 0; i < copied.length; i += 1) {
    const region = copied[i]!;
    if (!Number.isFinite(region.lMin) || !Number.isFinite(region.lMax) || !(region.lMax > region.lMin)) {
      throw new RangeError('surface region must have finite positive width');
    }
    if (!Object.hasOwn(SURFACE_MATERIALS, region.type) || !SURFACE_MATERIALS[region.type].supported) {
      throw new RangeError('surface region must name a supported material');
    }
    if (i > 0 && region.lMin < copied[i - 1]!.lMax - BAND_OVERLAP_TOLERANCE_METERS) {
      throw new Error('surface regions must not overlap');
    }
  }
  return Object.freeze(copied.map((region) => Object.freeze(region)));
}
