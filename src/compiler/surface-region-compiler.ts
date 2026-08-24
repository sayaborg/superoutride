import type {
  AuthoredGroundBase,
  AuthoredSurfaceBand,
  GroundMapMaterial,
  SurfaceRegionAuthoring,
} from '../course/surface-region.js';
import { wrapPositive } from '../core/math.js';

export interface GroundMapLogicalSection {
  readonly sStart: number;
  readonly name: string;
  readonly left: GroundMapMaterial;
  readonly right: GroundMapMaterial;
}

export interface GroundMapLogicalProfileReader {
  readonly courseLength: number;
  sample(s: number): GroundMapLogicalSection;
}

export interface CompiledVisualSection {
  readonly sStart: number;
  readonly name: string;
  readonly groundBaseLeft: AuthoredGroundBase;
  readonly groundBaseRight: AuthoredGroundBase;
}

export interface CompiledSurfaceSection {
  readonly sStart: number;
  readonly name: string;
  readonly bands: readonly AuthoredSurfaceBand[];
}

const EPSILON = 1e-9;

/** General logical GroundMap source. Chainage is the open interval [0, courseLength]. */
export class GroundMapLogicalProfile implements GroundMapLogicalProfileReader {
  readonly sections: readonly GroundMapLogicalSection[];

  constructor(readonly courseLength: number, sections: readonly GroundMapLogicalSection[]) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('GroundMap logical profile length must be finite and > 0');
    }
    const copied = sections.map((section) => ({ ...section })).sort((a, b) => a.sStart - b.sStart);
    if (copied.length === 0 || Math.abs(copied[0]!.sStart) > EPSILON) {
      throw new Error('GroundMap logical profile must start at s=0');
    }
    copied[0]!.sStart = 0;
    for (let i = 0; i < copied.length; i += 1) {
      const section = copied[i]!;
      if (!Number.isFinite(section.sStart) || section.sStart < 0 || section.sStart >= courseLength) {
        throw new RangeError('GroundMap section outside open profile');
      }
      if (section.name.trim().length === 0) throw new Error('GroundMap section name must be non-empty');
      if (i > 0 && section.sStart <= copied[i - 1]!.sStart) throw new Error('GroundMap sections must be unique');
    }
    this.sections = Object.freeze(copied);
  }

  sample(s: number): GroundMapLogicalSection {
    const local = openChainage(s, this.courseLength, 'GroundMap logical profile');
    let index = this.sections.length - 1;
    for (let i = 0; i < this.sections.length; i += 1) {
      if (this.sections[i]!.sStart <= local) index = i;
      else break;
    }
    return this.sections[index]!;
  }
}

/** Explicit legacy/circuit adapter. Only this layer performs periodic addressing. */
export class CyclicGroundMapLogicalProfile implements GroundMapLogicalProfileReader {
  readonly source: GroundMapLogicalProfile;

  constructor(readonly courseLength: number, sections: readonly GroundMapLogicalSection[]) {
    this.source = new GroundMapLogicalProfile(courseLength, sections);
  }

  get sections(): readonly GroundMapLogicalSection[] {
    return this.source.sections;
  }

  sample(s: number): GroundMapLogicalSection {
    return this.source.sample(wrapPositive(s, this.courseLength));
  }
}

export interface CompiledSurfaceRegions {
  readonly groundMap: GroundMapLogicalProfile;
  readonly visualSections: readonly CompiledVisualSection[];
  readonly surfaceSections: readonly CompiledSurfaceSection[];
}

export function compileSurfaceRegions(
  courseLength: number,
  regions: readonly SurfaceRegionAuthoring[],
): CompiledSurfaceRegions {
  const normalized = validateAndCopyRegions(courseLength, regions);

  const groundMapSections = coalesce(normalized, sameGroundMap, (region): GroundMapLogicalSection => ({
    sStart: region.sStart,
    name: region.name,
    left: region.groundMapLeft,
    right: region.groundMapRight,
  }));

  const visualSections = coalesce(normalized, sameVisual, (region): CompiledVisualSection => ({
    sStart: region.sStart,
    name: region.name,
    groundBaseLeft: copyGroundBase(region.groundBaseLeft),
    groundBaseRight: copyGroundBase(region.groundBaseRight),
  }));

  const surfaceSections = coalesce(normalized, sameSurfaceBands, (region): CompiledSurfaceSection => ({
    sStart: region.sStart,
    name: region.name,
    bands: region.surfaceBands.map((band) => ({ ...band })),
  }));

  return {
    groundMap: new GroundMapLogicalProfile(courseLength, groundMapSections),
    visualSections,
    surfaceSections,
  };
}

function validateAndCopyRegions(
  courseLength: number,
  regions: readonly SurfaceRegionAuthoring[],
): SurfaceRegionAuthoring[] {
  if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
    throw new RangeError('course length must be finite and > 0');
  }
  const copied = regions
    .map((region) => ({
      ...region,
      groundBaseLeft: copyGroundBase(region.groundBaseLeft),
      groundBaseRight: copyGroundBase(region.groundBaseRight),
      surfaceBands: region.surfaceBands.map((band) => ({ ...band })).sort((a, b) => a.lMin - b.lMin),
    }))
    .sort((a, b) => a.sStart - b.sStart);

  if (copied.length === 0 || Math.abs(copied[0]!.sStart) > 1e-9) {
    throw new Error('Surface Region authoring must start at s=0');
  }

  for (let i = 0; i < copied.length; i += 1) {
    const region = copied[i]!;
    if (!Number.isFinite(region.sStart) || region.sStart < 0 || region.sStart >= courseLength) {
      throw new RangeError('Surface Region outside course');
    }
    if (i > 0 && region.sStart <= copied[i - 1]!.sStart) {
      throw new Error('Surface Region starts must be unique');
    }
    if (region.name.trim().length === 0) throw new Error('Surface Region name must be non-empty');
    validateGroundBase(region.groundBaseLeft);
    validateGroundBase(region.groundBaseRight);

    for (let j = 0; j < region.surfaceBands.length; j += 1) {
      const band = region.surfaceBands[j]!;
      if (!Number.isFinite(band.lMin) || !Number.isFinite(band.lMax) || !(band.lMax > band.lMin)) {
        throw new Error('Surface Region band must have finite positive width');
      }
      if (j > 0 && band.lMin < region.surfaceBands[j - 1]!.lMax - 1e-9) {
        throw new Error('Surface Region bands must not overlap');
      }
    }
  }

  return copied;
}

function validateGroundBase(base: AuthoredGroundBase): void {
  if (base.kind === 'color' && (!Number.isInteger(base.color) || base.color < 0 || base.color > 0xffffffff)) {
    throw new RangeError('GroundBase color must be uint32');
  }
}

function copyGroundBase(base: AuthoredGroundBase): AuthoredGroundBase {
  return base.kind === 'transparent' ? { kind: 'transparent' } : { kind: 'color', color: base.color >>> 0 };
}

function sameGroundBase(a: AuthoredGroundBase, b: AuthoredGroundBase): boolean {
  return a.kind === b.kind && (a.kind === 'transparent' || (b.kind === 'color' && a.color === b.color));
}

function sameGroundMap(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  return a.groundMapLeft === b.groundMapLeft && a.groundMapRight === b.groundMapRight;
}

function sameVisual(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  return sameGroundBase(a.groundBaseLeft, b.groundBaseLeft)
    && sameGroundBase(a.groundBaseRight, b.groundBaseRight);
}

function sameSurfaceBands(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  if (a.surfaceBands.length !== b.surfaceBands.length) return false;
  return a.surfaceBands.every((band, index) => {
    const other = b.surfaceBands[index]!;
    return band.lMin === other.lMin && band.lMax === other.lMax && band.type === other.type;
  });
}

function coalesce<T, U>(
  regions: readonly T[],
  same: (a: T, b: T) => boolean,
  map: (region: T) => U,
): U[] {
  const out: U[] = [];
  let previous: T | undefined;
  for (const region of regions) {
    if (previous !== undefined && same(previous, region)) {
      previous = region;
      continue;
    }
    out.push(map(region));
    previous = region;
  }
  return out;
}

function openChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -EPSILON || s > courseLength + EPSILON) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= EPSILON) return 0;
  if (Math.abs(s - courseLength) <= EPSILON) return courseLength;
  return s;
}
