export type AuthoredSurfaceType = 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND';
export type GroundMapMaterial = 'GRASS' | 'ROCK';
export type AuthoredGroundBase = { readonly kind: 'color'; readonly color: number } | { readonly kind: 'transparent' };

/** Shared GroundBase boundary for authored regions and ordinary visual sources. */
export function compileGroundBase(base: AuthoredGroundBase): AuthoredGroundBase {
  if (base.kind === 'transparent') return Object.freeze({ kind: 'transparent' });
  if (base.kind !== 'color' || !Number.isInteger(base.color) || base.color < 0 || base.color > 0xffffffff) {
    throw new RangeError('GroundBase color must be uint32');
  }
  return Object.freeze({ kind: 'color', color: base.color });
}

export interface AuthoredSurfaceBand {
  readonly lMin: number;
  readonly lMax: number;
  readonly type: AuthoredSurfaceType;
}

export interface SurfaceRegionAuthoring {
  readonly sStart: number;
  readonly name: string;
  readonly groundMapLeft: GroundMapMaterial;
  readonly groundMapRight: GroundMapMaterial;
  readonly groundBaseLeft: AuthoredGroundBase;
  readonly groundBaseRight: AuthoredGroundBase;
  readonly surfaceBands: readonly AuthoredSurfaceBand[];
}
