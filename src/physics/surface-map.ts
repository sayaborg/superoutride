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

/**
 * Runtime SurfaceMap(s,l): piecewise-constant in authored s sections and lateral bands.
 * It is intentionally independent from GroundMap pixels and GroundBase paint rules.
 * Core Design Freeze §26.
 */
export class CyclicSurfaceMap {
  readonly sections: readonly SurfaceSection[];

  constructor(readonly courseLength: number, sections: readonly SurfaceSection[]) {
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
    const section = this.sectionAt(s);
    for (const band of section.bands) {
      if (l >= band.lMin && l <= band.lMax) {
        const material = SURFACE_MATERIALS[band.type];
        return { sectionName: section.name, type: band.type, material };
      }
    }
    return { sectionName: section.name, type: 'VOID', material: SURFACE_MATERIALS.VOID };
  }

  sectionAt(s: number): SurfaceSection {
    const local = wrapPositive(s, this.courseLength);
    let index = this.sections.length - 1;
    for (let i = 0; i < this.sections.length; i += 1) {
      if (this.sections[i]!.sStart <= local) index = i;
      else break;
    }
    return this.sections[index]!;
  }
}

function standardBands(
  leftOuter: SurfaceType,
  rightOuter: SurfaceType,
  roadLeft = 4.5,
  roadRight = 4.5,
  shoulderWidth = 1,
  outerLimit = 10.5,
): SurfaceBand[] {
  const bands: SurfaceBand[] = [];
  if (leftOuter !== 'VOID') bands.push({ lMin: -outerLimit, lMax: -(roadLeft + shoulderWidth), type: leftOuter });
  bands.push({ lMin: -(roadLeft + shoulderWidth), lMax: -roadLeft, type: 'SHOULDER' });
  bands.push({ lMin: -roadLeft, lMax: roadRight, type: 'ASPHALT' });
  bands.push({ lMin: roadRight, lMax: roadRight + shoulderWidth, type: 'SHOULDER' });
  if (rightOuter !== 'VOID') bands.push({ lMin: roadRight + shoulderWidth, lMax: outerLimit, type: rightOuter });
  return bands;
}

/** DEV authoring compiled into the runtime SurfaceMap. */
export function createM5DebugSurfaceMap(courseLength: number): CyclicSurfaceMap {
  const starts = [
    { sStart: 0, name: 'GRASSLAND', left: 'GRASS' as SurfaceType, right: 'GRASS' as SurfaceType },
    { sStart: 280, name: 'SAND PATCH', left: 'GRASS' as SurfaceType, right: 'SAND' as SurfaceType },
    { sStart: 360, name: 'DIRT PATCH', left: 'DIRT' as SurfaceType, right: 'GRASS' as SurfaceType },
    { sStart: 455, name: 'CLIFF / SEA', left: 'VOID' as SurfaceType, right: 'GRASS' as SurfaceType },
    { sStart: Math.min(625, courseLength - 1), name: 'GRASSLAND', left: 'GRASS' as SurfaceType, right: 'GRASS' as SurfaceType },
  ].filter((entry, index, array) => entry.sStart < courseLength && (index === 0 || entry.sStart > array[index - 1]!.sStart));

  return new CyclicSurfaceMap(courseLength, starts.map((entry) => {
    let bands = standardBands(entry.left, entry.right);
    // Cliff authoring: retain a narrow dirt verge, then unsupported space on the sea side.
    if (entry.name === 'CLIFF / SEA') {
      bands = [
        { lMin: -6.5, lMax: -5.5, type: 'DIRT' },
        { lMin: -5.5, lMax: -4.5, type: 'SHOULDER' },
        { lMin: -4.5, lMax: 4.5, type: 'ASPHALT' },
        { lMin: 4.5, lMax: 5.5, type: 'SHOULDER' },
        { lMin: 5.5, lMax: 10.5, type: 'GRASS' },
      ];
    }
    return { sStart: entry.sStart, name: entry.name, bands };
  }));
}
