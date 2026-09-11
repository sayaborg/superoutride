import { GroundMapLogicalProfile, type GroundMapLogicalSection } from '../groundmap/logical-profile.js';

import { compileOpenProfile } from '../core/open-profile.js';
import { nonEmptyId } from '../core/validation.js';
import type { AuthoredGroundBase, AuthoredSurfaceBand, SurfaceRegionAuthoring } from '../course/surface-region.js';
import { compileGroundBase } from '../course/surface-region.js';
import { compileSurfaceBands } from '../physics/surface-map.js';

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
    groundBaseLeft: region.groundBaseLeft,
    groundBaseRight: region.groundBaseRight,
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
): readonly SurfaceRegionAuthoring[] {
  return compileOpenProfile(
    regions.map((region) => {
      nonEmptyId(region.name, 'Surface Region name');
      return {
        ...region,
        groundBaseLeft: compileGroundBase(region.groundBaseLeft),
        groundBaseRight: compileGroundBase(region.groundBaseRight),
        surfaceBands: compileSurfaceBands(region.surfaceBands),
      };
    }),
    { length: courseLength, chainage: 'sStart', label: 'Surface Region authoring' },
  );
}

function sameGroundBase(a: AuthoredGroundBase, b: AuthoredGroundBase): boolean {
  return a.kind === b.kind && (a.kind === 'transparent' || (b.kind === 'color' && a.color === b.color));
}

function sameGroundMap(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  return a.groundMapLeft === b.groundMapLeft && a.groundMapRight === b.groundMapRight;
}

function sameVisual(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  return sameGroundBase(a.groundBaseLeft, b.groundBaseLeft) && sameGroundBase(a.groundBaseRight, b.groundBaseRight);
}

function sameSurfaceBands(a: SurfaceRegionAuthoring, b: SurfaceRegionAuthoring): boolean {
  if (a.surfaceBands.length !== b.surfaceBands.length) return false;
  return a.surfaceBands.every((band, index) => {
    const other = b.surfaceBands[index]!;
    return band.lMin === other.lMin && band.lMax === other.lMax && band.type === other.type;
  });
}

function coalesce<T, U>(regions: readonly T[], same: (a: T, b: T) => boolean, map: (region: T) => U): U[] {
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
