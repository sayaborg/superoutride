import type { JunctionCrossSectionProfile } from '../course/junction-cross-section.js';
import { wrapPositive } from '../core/math.js';

export type SurfaceType = 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND' | 'VOID';

export interface SurfaceMaterial {
  readonly type: SurfaceType;
  readonly supported: boolean;
  readonly friction: number;
  readonly rollingResistance: number;
  readonly driveScale: number;
}

export const SURFACE_MATERIALS: Readonly<Record<SurfaceType, SurfaceMaterial>> = {
  ASPHALT: { type: 'ASPHALT', supported: true, friction: 1.05, rollingResistance: 0.014, driveScale: 1.0 },
  SHOULDER: { type: 'SHOULDER', supported: true, friction: 0.82, rollingResistance: 0.025, driveScale: 0.92 },
  GRASS: { type: 'GRASS', supported: true, friction: 0.52, rollingResistance: 0.065, driveScale: 0.72 },
  DIRT: { type: 'DIRT', supported: true, friction: 0.64, rollingResistance: 0.045, driveScale: 0.82 },
  SAND: { type: 'SAND', supported: true, friction: 0.40, rollingResistance: 0.11, driveScale: 0.58 },
  VOID: { type: 'VOID', supported: false, friction: 0, rollingResistance: 0, driveScale: 0 },
};

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
    if (!(courseLength > 0)) throw new RangeError('course length must be > 0');
    const copied = sections
      .map((section) => ({
        ...section,
        bands: section.bands.map((band) => ({ ...band })).sort((a, b) => a.lMin - b.lMin),
      }))
      .sort((a, b) => a.sStart - b.sStart);
    if (copied.length === 0 || Math.abs(copied[0]!.sStart) > 1e-9) {
      throw new Error('surface profile must start at s=0');
    }
    for (let i = 0; i < copied.length; i += 1) {
      const section = copied[i]!;
      if (section.sStart < 0 || section.sStart >= courseLength) throw new RangeError('surface section outside course');
      if (i > 0 && section.sStart <= copied[i - 1]!.sStart) throw new Error('surface sections must be unique');
      for (let j = 0; j < section.bands.length; j += 1) {
        const band = section.bands[j]!;
        if (!(band.lMax > band.lMin)) throw new Error('surface band must have positive width');
        if (j > 0 && band.lMin < section.bands[j - 1]!.lMax - 1e-9) {
          throw new Error('surface bands must not overlap');
        }
      }
    }
    this.sections = copied;
  }

  sample(s: number, l: number): SurfaceSample {
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

    for (const band of section.bands) {
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

  protected normalizeChainage(s: number): number {
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

/** Explicit closed-course adapter retained only where cyclic topology is intentionally authored. */
export class CyclicSurfaceMap extends SurfaceMap {
  protected override normalizeChainage(s: number): number {
    if (!Number.isFinite(s)) throw new RangeError('surface chainage must be finite');
    return wrapPositive(s, this.courseLength);
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
