import { openProfileChainage } from '../core/open-profile-chainage.js';
import { compileOpenProfile, profileIndexAt } from '../core/open-profile.js';
import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';

export type SurfaceType = 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND' | 'VOID';

/**
 * Surface authority is relative to the tire profile.
 * Each tire friction axis is scaled by material.gripFactor.
 */
export interface SurfaceMaterial {
  readonly type: SurfaceType;
  readonly supported: boolean;
  readonly gripFactor: number;
  readonly rollingResistance: number;
}

export const SURFACE_MATERIALS: Readonly<Record<SurfaceType, SurfaceMaterial>> = Object.freeze({
  ASPHALT: Object.freeze({ type: 'ASPHALT', supported: true, gripFactor: 1.0, rollingResistance: 0.014 }),
  SHOULDER: Object.freeze({ type: 'SHOULDER', supported: true, gripFactor: 0.78, rollingResistance: 0.025 }),
  GRASS: Object.freeze({ type: 'GRASS', supported: true, gripFactor: 0.43, rollingResistance: 0.065 }),
  DIRT: Object.freeze({ type: 'DIRT', supported: true, gripFactor: 0.52, rollingResistance: 0.045 }),
  SAND: Object.freeze({ type: 'SAND', supported: true, gripFactor: 0.33, rollingResistance: 0.11 }),
  VOID: Object.freeze({ type: 'VOID', supported: false, gripFactor: 0, rollingResistance: 0 }),
});

export interface SurfaceBand {
  readonly lMin: number;
  readonly lMax: number;
  readonly type: Exclude<SurfaceType, 'VOID'>;
}

export interface SurfaceSection {
  readonly sStart: number;
  readonly name: string;
  readonly bands: readonly SurfaceBand[];
}

export interface SurfaceSample {
  readonly sectionName: string;
  readonly type: SurfaceType;
  readonly material: SurfaceMaterial;
}

/** Minimal read-only physics contract for SurfaceMap(s,l). */
export interface SurfaceMapReader {
  /** Conservative bound in this reader's local lateral frame, including junction support. */
  readonly maxSupportedAbsL: number;
  sample(s: number, l: number): SurfaceSample;
}

/**
 * General runtime SurfaceMap(s,l): an open [0, courseLength] chainage domain containing
 * piecewise-constant authored terrain plus an optional continuous junction cross-section.
 * GroundMap pixels and GroundBase paint remain independent.
 */
export class SurfaceMap implements SurfaceMapReader {
  readonly sections: readonly SurfaceSection[];
  readonly maxSupportedAbsL: number;

  constructor(
    readonly courseLength: number,
    sections: readonly SurfaceSection[],
    readonly junction?: JunctionCrossSectionProfile,
  ) {
    this.sections = compileOpenProfile(
      sections.map((section) => ({
        ...section,
        bands: compileSurfaceBands(section.bands),
      })),
      { length: courseLength, chainage: 'sStart', label: 'surface profile' },
    );
    let extent = junction?.maxSupportedAbsL ?? 0;
    for (const section of this.sections)
      for (const band of section.bands) {
        extent = Math.max(extent, Math.abs(band.lMin), Math.abs(band.lMax));
      }
    this.maxSupportedAbsL = extent;
  }

  sample(s: number, l: number): SurfaceSample {
    if (!Number.isFinite(l)) throw new RangeError('surface lateral coordinate must be finite');
    const local = this.normalizeChainage(s);
    const section = this.sectionAtLocal(local);

    if (this.junction) {
      const junctionClass = this.junction.classify(local, l);
      const type = junctionSurfaceType(junctionClass);
      if (type !== null) {
        return {
          sectionName: `${section.name} / JUNCTION`,
          type,
          material: SURFACE_MATERIALS[type],
        };
      }
    }

    for (let i = 0; i < section.bands.length; i += 1) {
      const band = section.bands[i]!;
      if (l >= band.lMin && l <= band.lMax) {
        const material = SURFACE_MATERIALS[band.type];
        return { sectionName: section.name, type: band.type, material };
      }
    }
    return { sectionName: section.name, type: 'VOID', material: SURFACE_MATERIALS.VOID };
  }

  sectionAt(s: number): SurfaceSection {
    return this.sectionAtLocal(this.normalizeChainage(s));
  }

  private normalizeChainage(s: number): number {
    return openProfileChainage(s, this.courseLength, 'surface');
  }

  private sectionAtLocal(local: number): SurfaceSection {
    return this.sections[profileIndexAt(this.sections, 'sStart', local)]!;
  }
}

function junctionSurfaceType(
  lateralClass: ReturnType<JunctionCrossSectionProfile['classify']>,
): Exclude<SurfaceType, 'VOID'> | null {
  if (lateralClass === 'ASPHALT_SINGLE' || lateralClass === 'ASPHALT_LEFT' || lateralClass === 'ASPHALT_RIGHT')
    return 'ASPHALT';
  if (lateralClass === 'SHOULDER') return 'SHOULDER';
  if (lateralClass === 'MEDIAN') return 'GRASS';
  return null;
}

/** One physical-band compiler for both region authoring and runtime SurfaceMap sources. */
export function compileSurfaceBands(bands: readonly SurfaceBand[]): readonly SurfaceBand[] {
  const copied = bands.map((band) => ({ ...band })).sort((a, b) => a.lMin - b.lMin);
  for (let i = 0; i < copied.length; i += 1) {
    const band = copied[i]!;
    if (!Number.isFinite(band.lMin) || !Number.isFinite(band.lMax) || !(band.lMax > band.lMin)) {
      throw new RangeError('surface band must have finite positive width');
    }
    if (!Object.hasOwn(SURFACE_MATERIALS, band.type) || !SURFACE_MATERIALS[band.type].supported) {
      throw new RangeError('surface band must name a supported material');
    }
    if (i > 0 && band.lMin < copied[i - 1]!.lMax - 1e-9) {
      throw new Error('surface bands must not overlap');
    }
  }
  return Object.freeze(copied.map((band) => Object.freeze(band)));
}
