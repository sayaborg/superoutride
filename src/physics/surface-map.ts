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
  ASPHALT: Object.freeze({ type: 'ASPHALT', supported: true, gripFactor: 1.00, rollingResistance: 0.014 }),
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
  sample(s: number, l: number): SurfaceSample;
}

/**
 * General runtime SurfaceMap(s,l): an open [0, courseLength] chainage domain containing
 * piecewise-constant authored terrain plus an optional continuous junction cross-section.
 * GroundMap pixels and GroundBase paint remain independent.
 */
export class SurfaceMap implements SurfaceMapReader {
  readonly sections: readonly SurfaceSection[];

  constructor(
    readonly courseLength: number,
    sections: readonly SurfaceSection[],
    readonly junction?: JunctionCrossSectionProfile,
  ) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('course length must be finite and > 0');
    }
    const copied = sections
      .map((section) => ({
        ...section,
        bands: section.bands.map((band) => ({ ...band })).sort((a, b) => a.lMin - b.lMin),
      }))
      .sort((a, b) => a.sStart - b.sStart);
    for (const section of copied) {
      if (!Number.isFinite(section.sStart)) throw new RangeError('surface section chainage must be finite');
    }
    if (copied.length === 0 || Math.abs(copied[0]!.sStart) > 1e-9) {
      throw new Error('surface profile must start at s=0');
    }
    copied[0]!.sStart = 0;
    for (let i = 0; i < copied.length; i += 1) {
      const section = copied[i]!;
      if (section.sStart < 0 || section.sStart >= courseLength) throw new RangeError('surface section outside course');
      if (i > 0 && section.sStart <= copied[i - 1]!.sStart) throw new Error('surface sections must be unique');
      for (let j = 0; j < section.bands.length; j += 1) {
        const band = section.bands[j]!;
        if (!Number.isFinite(band.lMin) || !Number.isFinite(band.lMax)) {
          throw new RangeError('surface band edges must be finite');
        }
        if (!(band.lMax > band.lMin)) throw new Error('surface band must have positive width');
        if (j > 0 && band.lMin < section.bands[j - 1]!.lMax - 1e-9) {
          throw new Error('surface bands must not overlap');
        }
      }
    }
    this.sections = Object.freeze(copied.map((section) => Object.freeze({
      ...section,
      bands: Object.freeze(section.bands.map((band) => Object.freeze(band))),
    })));
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
    if (!Number.isFinite(s) || s < 0 || s > this.courseLength) {
      throw new RangeError(`surface chainage ${s} outside [0, ${this.courseLength}]`);
    }
    return s;
  }

  private sectionAtLocal(local: number): SurfaceSection {
    let index = this.sections.length - 1;
    for (let i = 0; i < this.sections.length; i += 1) {
      if (this.sections[i]!.sStart <= local) index = i;
      else break;
    }
    return this.sections[index]!;
  }
}

function junctionSurfaceType(
  lateralClass: ReturnType<JunctionCrossSectionProfile['classify']>,
): Exclude<SurfaceType, 'VOID'> | null {
  if (
    lateralClass === 'ASPHALT_SINGLE'
    || lateralClass === 'ASPHALT_LEFT'
    || lateralClass === 'ASPHALT_RIGHT'
  ) return 'ASPHALT';
  if (lateralClass === 'SHOULDER') return 'SHOULDER';
  if (lateralClass === 'MEDIAN') return 'GRASS';
  return null;
}
